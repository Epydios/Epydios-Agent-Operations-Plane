import { chipClassForStatus, escapeHTML, renderPanelStateMetric } from "../../../views/common.js";
import { renderAimxsRouteBoundaryBlock } from "../../../shared/components/aimxs-route-boundary.js";
import { createPlatformWorkspaceSnapshot } from "../state.js";

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
        <span class="platformops-value-pill">
          <span class="platformops-value-key">${escapeHTML(label)}</span>
          <span class="platformops-value-text${item?.code ? " platformops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="platformops-empty">not available</span>';
  }
  return `<div class="platformops-value-group">${values.join("")}</div>`;
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
        <div class="platformops-row">
          <div class="platformops-row-label">${escapeHTML(label)}</div>
          <div class="platformops-row-value">${value || '<span class="platformops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderEnvironmentOverviewBoard(snapshot) {
  const board = snapshot.environmentOverview;
  const rows = [
    {
      label: "Operating Surface",
      value: renderValuePills([
        { label: "surface", value: board.surface, code: true },
        { label: "namespace", value: board.namespace, code: true }
      ])
    },
    {
      label: "AIMXS Selection",
      value: renderValuePills([
        { label: "mode", value: board.activeMode },
        { label: "provider", value: board.selectedProviderId, code: true }
      ])
    },
    {
      label: "Release Signals",
      value: renderValuePills([
        { label: "pipeline", value: board.pipelineStatus },
        { label: "staging", value: board.latestStagingGate, code: true },
        { label: "prod", value: board.latestProdGate, code: true }
      ])
    }
  ];
  return `
    <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="environment-overview">
      <div class="metric-title-row">
        <div class="title">Environment Overview</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="platformops-chip-row">
        <span class="chip chip-neutral chip-compact">surface=${escapeHTML(board.surface)}</span>
        <span class="chip chip-neutral chip-compact">mode=${escapeHTML(board.activeMode)}</span>
        <span class="${chipClassForStatus(board.pipelineStatus)} chip-compact">pipeline</span>
      </div>
      <div class="platformops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderDeploymentPostureBoard(snapshot) {
  const board = snapshot.deploymentPosture;
  const rows = [
    {
      label: "Deployment Status",
      value: renderValuePills([
        { label: "runtime", value: board.runtimeStatus },
        { label: "providers", value: board.providersStatus },
        { label: "policy", value: board.policyStatus }
      ])
    },
    {
      label: "Control Plane Posture",
      value: renderValuePills([
        { label: "pipeline", value: board.pipelineStatus },
        { label: "aimxs", value: board.aimxsState },
        { label: "enabled providers", value: String(board.enabledProviderCount) }
      ])
    },
    {
      label: "Selected Provider",
      value: renderValuePills([
        { label: "ready", value: board.selectedProviderReady ? "yes" : "no" },
        { label: "probed", value: board.selectedProviderProbed ? "yes" : "no" }
      ])
    }
  ];
  return `
    <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="deployment-posture">
      <div class="metric-title-row">
        <div class="title">Deployment Posture</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="platformops-chip-row">
        <span class="${chipClassForStatus(board.runtimeStatus)} chip-compact">runtime</span>
        <span class="${chipClassForStatus(board.providersStatus)} chip-compact">providers</span>
        <span class="${chipClassForStatus(board.policyStatus)} chip-compact">policy</span>
        <span class="${chipClassForStatus(board.pipelineStatus)} chip-compact">pipeline</span>
      </div>
      <div class="platformops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderDependencyReadinessBoard(snapshot) {
  const board = snapshot.dependencyReadiness;
  const rows = [
    {
      label: "Provider Dependencies",
      value: renderValuePills([
        { label: "ready", value: String(board.providerReadyCount) },
        { label: "degraded", value: String(board.providerDegradedCount) },
        { label: "unknown", value: String(board.providerUnknownCount) }
      ])
    },
    {
      label: "AIMXS Dependencies",
      value: renderValuePills([
        { label: "secrets present", value: String(board.secretPresentCount) },
        { label: "secrets missing", value: String(board.secretMissingCount) },
        { label: "enabled ready", value: String(board.enabledReadyCount) }
      ])
    },
    {
      label: "Readiness Signals",
      value: renderValuePills([
        { label: "capabilities", value: String(board.capabilityCount) },
        { label: "warnings", value: String(board.warningCount) },
        { label: "providers", value: String(board.providerTotalCount) }
      ])
    }
  ];
  return `
    <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="dependency-readiness">
      <div class="metric-title-row">
        <div class="title">Dependency Readiness</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="platformops-chip-row">
        <span class="chip chip-neutral chip-compact">providers=${escapeHTML(String(board.providerTotalCount))}</span>
        <span class="chip chip-neutral chip-compact">secrets missing=${escapeHTML(String(board.secretMissingCount))}</span>
        <span class="chip chip-neutral chip-compact">warnings=${escapeHTML(String(board.warningCount))}</span>
      </div>
      <div class="platformops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderProviderRegistrationBoard(snapshot) {
  const board = snapshot.providerRegistration;
  const rows = [
    {
      label: "Registration Inventory",
      value: renderValuePills([
        { label: "total", value: String(board.totalCount) },
        { label: "ready", value: String(board.readyCount) },
        { label: "degraded", value: String(board.degradedCount) },
        { label: "unknown", value: String(board.unknownCount) }
      ])
    },
    {
      label: "Selected Provider",
      value: renderValuePills([
        { label: "provider", value: board.selectedProviderId, code: true },
        { label: "ready", value: board.selectedProviderReady ? "yes" : "no" },
        { label: "probed", value: board.selectedProviderProbed ? "yes" : "no" }
      ])
    },
    {
      label: "Registration Signals",
      value: renderValuePills([
        { label: "probed", value: String(board.probedProviderCount) },
        { label: "enabled aimxs", value: String(board.enabledProviderCount) },
        { label: "enabled ready", value: String(board.enabledReadyCount) },
        { label: "first degraded", value: board.firstDegradedProviderId, code: true }
      ])
    }
  ];
  return `
    <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="provider-registration">
      <div class="metric-title-row">
        <div class="title">Provider Registration</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="platformops-chip-row">
        <span class="chip chip-neutral chip-compact">providers=${escapeHTML(String(board.totalCount))}</span>
        <span class="chip chip-neutral chip-compact">ready=${escapeHTML(String(board.readyCount))}</span>
        <span class="chip chip-neutral chip-compact">degraded=${escapeHTML(String(board.degradedCount))}</span>
      </div>
      <div class="platformops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderAimxsBridgeReadinessBoard(snapshot) {
  const board = snapshot.aimxsBridgeReadiness;
  const rows = [
    {
      label: "Bridge State",
      value: renderValuePills([
        { label: "state", value: board.state },
        { label: "mode", value: board.activeMode },
        { label: "available", value: board.available ? "yes" : "no" }
      ])
    },
    {
      label: "Selected Provider",
      value: renderValuePills([
        { label: "provider", value: board.selectedProviderId, code: true },
        { label: "ready", value: board.selectedProviderReady ? "yes" : "no" },
        { label: "probed", value: board.selectedProviderProbed ? "yes" : "no" }
      ])
    },
    {
      label: "Bridge Readiness",
      value: renderValuePills([
        { label: "secrets present", value: String(board.secretPresentCount) },
        { label: "secrets missing", value: String(board.secretMissingCount) },
        { label: "capabilities", value: String(board.capabilityCount) },
        { label: "warnings", value: String(board.warningCount) }
      ])
    },
    {
      label: "Enabled Providers",
      value: renderValuePills([
        { label: "enabled", value: String(board.enabledProviderCount) },
        { label: "enabled ready", value: String(board.enabledReadyCount) },
        { label: "first warning", value: board.firstWarning }
      ])
    }
  ];
  return `
    <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="aimxs-bridge-readiness">
      <div class="metric-title-row">
        <div class="title">AIMXS Bridge Readiness</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="platformops-chip-row">
        <span class="${chipClassForStatus(board.state)} chip-compact">aimxs</span>
        <span class="chip chip-neutral chip-compact">mode=${escapeHTML(board.activeMode)}</span>
        <span class="chip chip-neutral chip-compact">warnings=${escapeHTML(String(board.warningCount))}</span>
      </div>
      <div class="platformops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderAimxsRouteBoundaryBoard(snapshot) {
  return `
    <article class="metric platformops-card platformops-card-wide" data-domain-root="platformops" data-platformops-panel="aimxs-route-boundary">
      <div class="metric-title-row">
        <div class="title">AIMXS Route And Boundary</div>
        <span class="chip chip-neutral chip-compact">primary</span>
      </div>
      ${renderAimxsRouteBoundaryBlock(snapshot.aimxsRouteBoundary)}
    </article>
  `;
}

function renderReleaseReadinessBoard(snapshot) {
  const board = snapshot.releaseReadiness;
  const rows = [
    {
      label: "Gate Signals",
      value: renderValuePills([
        { label: "pipeline", value: board.pipelineStatus },
        { label: "staging", value: board.latestStagingGate, code: true },
        { label: "prod", value: board.latestProdGate, code: true }
      ])
    },
    {
      label: "Deployment Coverage",
      value: renderValuePills([
        { label: "healthy", value: String(board.deploymentHealthyCount) },
        { label: "issues", value: String(board.deploymentIssueCount) },
        { label: "selected ready", value: board.selectedProviderReady ? "yes" : "no" }
      ])
    },
    {
      label: "Release Risks",
      value: renderValuePills([
        { label: "provider degraded", value: String(board.providerDegradedCount) },
        { label: "provider ready", value: String(board.providerReadyCount) },
        { label: "secrets missing", value: String(board.secretMissingCount) },
        { label: "warnings", value: String(board.warningCount) }
      ])
    }
  ];
  return `
    <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="release-readiness">
      <div class="metric-title-row">
        <div class="title">Release Readiness</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="platformops-chip-row">
        <span class="${chipClassForStatus(board.pipelineStatus)} chip-compact">pipeline</span>
        <span class="chip chip-neutral chip-compact">environment=${escapeHTML(board.environment)}</span>
        <span class="chip chip-neutral chip-compact">issues=${escapeHTML(String(board.deploymentIssueCount))}</span>
      </div>
      <div class="platformops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderSupportPostureBoard(snapshot) {
  const board = snapshot.supportPosture;
  const rows = [
    {
      label: "Current Support Surface",
      value: renderValuePills([
        { label: "environment", value: board.environment },
        { label: "mode", value: board.activeMode },
        { label: "provider", value: board.selectedProviderId, code: true },
        { label: "selected ready", value: board.selectedProviderReady ? "yes" : "no" }
      ])
    },
    {
      label: "Attention Signals",
      value: renderValuePills([
        { label: "signals", value: String(board.supportSignalCount) },
        { label: "warnings", value: String(board.warningCount) },
        { label: "degraded", value: String(board.degradedProviderCount) },
        { label: "unknown", value: String(board.unknownProviderCount) },
        { label: "secrets missing", value: String(board.secretMissingCount) }
      ])
    },
    {
      label: "Runtime Detail",
      value: renderValuePills([{ label: "runtime", value: board.runtimeDetail }])
    },
    {
      label: "Provider Detail",
      value: renderValuePills([
        { label: "providers", value: board.providersDetail },
        { label: "policy", value: board.policyDetail },
        { label: "first warning", value: board.firstWarning }
      ])
    }
  ];
  return `
    <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="support-posture">
      <div class="metric-title-row">
        <div class="title">Support Posture</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="platformops-chip-row">
        <span class="chip chip-neutral chip-compact">signals=${escapeHTML(String(board.supportSignalCount))}</span>
        <span class="chip chip-neutral chip-compact">warnings=${escapeHTML(String(board.warningCount))}</span>
        <span class="chip chip-neutral chip-compact">environment=${escapeHTML(board.environment)}</span>
      </div>
      <div class="platformops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function platformAdminStatusChipClass(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved" || normalized === "applied") {
    return "chip chip-ok chip-compact";
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

function renderOperationalFeedback(snapshot) {
  const feedback = snapshot?.admin?.feedback;
  if (!feedback?.message) {
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
      ? "Platform admin action failed"
      : feedback.tone === "ok"
        ? "Platform admin action completed"
        : feedback.tone === "warn"
          ? "Platform admin handoff required"
          : "Platform admin update";
  return `
    <div class="platformops-feedback-shell" data-platformops-panel="operational-feedback">
      ${renderPanelStateMetric(tone, title, feedback.message)}
    </div>
  `;
}

function renderPlatformAdminActionRow(changeId = "") {
  const attrs = changeId
    ? ` data-platformops-admin-id="${escapeHTML(changeId)}"`
    : "";
  return `
    <div class="platformops-action-row">
      <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="save-draft"${attrs}>Save Draft</button>
      <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="simulate-draft"${attrs}>Run Dry-Run</button>
      <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="route-draft"${attrs}>Route To Governance</button>
    </div>
  `;
}

function renderPlatformAdminQueueBoard(snapshot) {
  const admin = snapshot.admin || {};
  const items = Array.isArray(admin.queueItems) ? admin.queueItems : [];
  const selectedChangeId = String(admin.selectedChangeId || "").trim();
  const queueMarkup =
    items.length > 0
      ? items
        .map((item) => {
            const id = String(item?.id || "").trim();
            const status = String(item?.status || "draft").trim().toLowerCase();
            const selected = id && id === selectedChangeId;
            const routeActionLabel =
              status === "routed" ||
              status === "approved" ||
              status === "applied" ||
              status === "rolled_back" ||
              status === "deferred" ||
              status === "escalated"
                ? "Open GovernanceOps"
                : "Route To Governance";
            const routeAction =
              status === "routed" ||
              status === "approved" ||
              status === "applied" ||
              status === "rolled_back" ||
              status === "deferred" ||
              status === "escalated"
                ? "open-governance"
                : "route-queue-item";
            const rollbackStatus = String(item?.rollback?.status || "").trim().toLowerCase();
            return `
              <article class="platformops-queue-card${selected ? " platformops-queue-card-selected" : ""}" data-platformops-admin-queue-id="${escapeHTML(id)}">
                <div class="metric-title-row">
                  <div class="title">${escapeHTML(String(item?.label || "").trim() || "Queued proposal")}</div>
                  <span class="${platformAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
                </div>
                <div class="platformops-chip-row">
                  <span class="chip chip-neutral chip-compact">${escapeHTML(String(item?.requestedAction || "").trim() || "proposal")}</span>
                  <span class="chip chip-neutral chip-compact">${escapeHTML(String(item?.environment || "").trim() || "local")}</span>
                  ${item?.decision?.approvalReceiptId ? '<span class="chip chip-ok chip-compact">decision receipt</span>' : ""}
                  ${item?.receipt?.receiptId ? '<span class="chip chip-ok chip-compact">admin receipt</span>' : ""}
                  ${rollbackStatus ? `<span class="${platformAdminStatusChipClass(rollbackStatus)}">${escapeHTML(rollbackStatus)}</span>` : ""}
                </div>
                <div class="platformops-kv-list">
                  ${renderKeyValueRows([
                    {
                      label: "Summary",
                      value: escapeHTML(String(item?.summary || "").trim() || "-")
                    },
                    {
                      label: "Target",
                      value: renderValuePills([
                        { label: "release", value: String(item?.releaseRef || item?.subjectId || "").trim(), code: true },
                        { label: "environment", value: String(item?.environment || "").trim() },
                        { label: "deployment", value: String(item?.deploymentTarget || "").trim(), code: true }
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
                      label: "Recovery",
                      value: escapeHTML(String(item?.rollback?.summary || "").trim() || "pending")
                    }
                  ])}
                </div>
                <div class="platformops-action-row">
                  <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="select-queue-item" data-platformops-admin-id="${escapeHTML(id)}">Select Proposal</button>
                  <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="simulate-queue-item" data-platformops-admin-id="${escapeHTML(id)}">Refresh Dry-Run</button>
                  <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="${escapeHTML(routeAction)}" data-platformops-admin-id="${escapeHTML(id)}">${escapeHTML(routeActionLabel)}</button>
                </div>
              </article>
            `;
          })
          .join("")
      : `
          <div class="platformops-kv-list">
            <div class="platformops-row">
              <div class="platformops-row-label">Status</div>
              <div class="platformops-row-value"><span class="platformops-empty">No platform admin proposal is queued yet.</span></div>
            </div>
          </div>
        `;
  return `
    <article class="metric platformops-card platformops-card-wide" data-domain-root="platformops" data-platformops-panel="admin-change-queue">
      <div class="metric-title-row">
        <div class="title">Admin Change Queue</div>
        <span class="chip chip-neutral chip-compact">proposal-only</span>
      </div>
      <div class="platformops-chip-row">
        <span class="chip chip-neutral chip-compact">queued=${escapeHTML(String(items.length))}</span>
        <span class="chip chip-neutral chip-compact">selected=${escapeHTML(selectedChangeId || "none")}</span>
      </div>
      <div class="platformops-queue-grid">${queueMarkup}</div>
    </article>
  `;
}

function renderPlatformGovernanceRouteReceiptBoard(snapshot) {
  const item = snapshot?.admin?.selectedQueueItem;
  if (!item) {
    return `
      <article class="metric platformops-card platformops-card-wide" data-domain-root="platformops" data-platformops-panel="governance-route-receipt">
        <div class="metric-title-row">
          <div class="title">Governance Route And Receipt</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="platformops-kv-list">
          <div class="platformops-row">
            <div class="platformops-row-label">Status</div>
            <div class="platformops-row-value"><span class="platformops-empty">Select or queue a platform admin proposal to review governance status, apply posture, and receipt state.</span></div>
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
  const canApply = status === "approved" && Boolean(decision?.approvalReceiptId) && !receipt?.receiptId;

  const rows = [
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
      value: escapeHTML(String(decision?.reason || item.reason || "").trim() || "-")
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
    <article class="metric platformops-card platformops-card-wide" data-domain-root="platformops" data-platformops-panel="governance-route-receipt">
      <div class="metric-title-row">
        <div class="title">Governance Route And Receipt</div>
        <span class="${platformAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="platformops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(item.id)}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(item.kind || "platform")}</span>
        ${decision?.approvalReceiptId ? '<span class="chip chip-ok chip-compact">approval receipt</span>' : '<span class="chip chip-neutral chip-compact">decision pending</span>'}
        ${receipt?.receiptId ? '<span class="chip chip-ok chip-compact">admin receipt</span>' : '<span class="chip chip-neutral chip-compact">apply pending</span>'}
        ${rollback?.rollbackId ? `<span class="${platformAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "rollback")}</span>` : '<span class="chip chip-neutral chip-compact">recovery pending</span>'}
      </div>
      <div class="platformops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="platformops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="open-governance" data-platformops-admin-id="${escapeHTML(item.id)}">Open GovernanceOps</button>
        <button class="btn btn-ok btn-small" type="button" data-platformops-admin-action="apply-approved-change" data-platformops-admin-id="${escapeHTML(item.id)}"${canApply ? "" : " disabled"}>Apply Approved Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="copy-governance-receipt" data-platformops-admin-id="${escapeHTML(item.id)}"${decision?.approvalReceiptId ? "" : " disabled"}>Copy Governance Receipt</button>
        <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="copy-admin-receipt" data-platformops-admin-id="${escapeHTML(item.id)}"${receipt?.receiptId ? "" : " disabled"}>Copy Admin Receipt</button>
      </div>
    </article>
  `;
}

function renderPlatformRollbackHistoryBoard(snapshot) {
  const item = snapshot?.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric platformops-card platformops-card-wide" data-domain-root="platformops" data-platformops-panel="rollback-history">
        <div class="metric-title-row">
          <div class="title">Rollback And History</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="platformops-kv-list">
          <div class="platformops-row">
            <div class="platformops-row-label">Status</div>
            <div class="platformops-row-value"><span class="platformops-empty">Select an applied platform admin proposal to review recovery posture, bounded history, and rollback actions.</span></div>
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
      label: "Rollback",
      at: rollback?.rolledBackAt,
      summary: rollback?.summary
    }
  ].filter((entry) => entry.at || entry.summary);
  const historyMarkup =
    historyItems.length > 0
      ? `<div class="platformops-history-list">${historyItems
          .map(
            (entry) => `
              <div class="platformops-history-item">
                <div class="platformops-history-stage">${escapeHTML(entry.label)}</div>
                <div class="platformops-history-time">${escapeHTML(entry.at || "-")}</div>
                <div class="platformops-history-summary">${escapeHTML(entry.summary || "-")}</div>
              </div>
            `
          )
          .join("")}</div>`
      : '<div class="platformops-empty">No bounded platform admin history is available yet.</div>';

  return `
    <article class="metric platformops-card platformops-card-wide" data-domain-root="platformops" data-platformops-panel="rollback-history">
      <div class="metric-title-row">
        <div class="title">Rollback And History</div>
        <span class="${platformAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="platformops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(item.id)}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(item.kind || "platform")}</span>
        ${rollback?.rollbackId ? `<span class="${platformAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "rollback")}</span>` : `<span class="chip chip-neutral chip-compact">${escapeHTML(canRollback ? "rollback available" : "recovery pending")}</span>`}
      </div>
      <div class="platformops-kv-list">
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
            value: rollback?.reason ? escapeHTML(rollback.reason) : '<span class="platformops-empty">A bounded reason is required before rollback can execute.</span>'
          },
          {
            label: "Stable History",
            value: historyMarkup
          }
        ])}
      </div>
      <label class="field platformops-field-wide">
        <span class="label">Rollback Reason</span>
        <input
          class="filter-input"
          type="text"
          value="${escapeHTML(recoveryReason)}"
          placeholder="required; explain the rollback action"
          data-platformops-admin-recovery-reason
        />
      </label>
      <div class="platformops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="rollback-applied-change" data-platformops-admin-id="${escapeHTML(item.id)}"${canRollback ? "" : " disabled"}>Rollback Applied Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-platformops-admin-action="copy-rollback-receipt" data-platformops-admin-id="${escapeHTML(item.id)}"${rollback?.rollbackId ? "" : " disabled"}>Copy Rollback Receipt</button>
      </div>
    </article>
  `;
}

function renderPlatformPromotionDraftBoard(snapshot) {
  const admin = snapshot.admin || {};
  const draft = admin.draft || {};
  return `
    <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="promotion-draft">
      <div class="metric-title-row">
        <div class="title">Promotion Draft</div>
        <span class="chip chip-neutral chip-compact">proposal</span>
      </div>
      <div class="platformops-draft-grid">
        <label class="field">
          <span class="label">Change Kind</span>
          <select class="filter-select" data-platformops-draft-field="changeKind">
            <option value="promote"${draft.changeKind === "promote" ? " selected" : ""}>Promote</option>
            <option value="rollback"${draft.changeKind === "rollback" ? " selected" : ""}>Rollback</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Environment</span>
          <input class="filter-input" type="text" value="${escapeHTML(draft.environment || "")}" data-platformops-draft-field="environment" />
        </label>
        <label class="field">
          <span class="label">Deployment Target</span>
          <input class="filter-input" type="text" value="${escapeHTML(draft.deploymentTarget || "")}" data-platformops-draft-field="deploymentTarget" />
        </label>
        <label class="field">
          <span class="label">Release Ref</span>
          <input class="filter-input" type="text" value="${escapeHTML(draft.releaseRef || "")}" data-platformops-draft-field="releaseRef" />
        </label>
        <label class="field platformops-field-wide">
          <span class="label">Reason</span>
          <textarea class="composer-textarea" rows="3" data-platformops-draft-field="reason">${escapeHTML(draft.reason || "")}</textarea>
        </label>
      </div>
      ${renderPlatformAdminActionRow()}
    </article>
  `;
}

function renderPlatformEnvironmentScopeBoard(snapshot) {
  const admin = snapshot.admin || {};
  const draft = admin.draft || {};
  const currentScope = admin.currentScope || {};
  const rows = [
    {
      label: "Current Platform Scope",
      value: renderValuePills([
        { label: "environment", value: currentScope.environment },
        { label: "deployment", value: currentScope.deploymentTarget, code: true },
        { label: "pipeline", value: currentScope.pipelineStatus }
      ])
    },
    {
      label: "Draft Target",
      value: renderValuePills([
        { label: "change", value: draft.changeKind },
        { label: "environment", value: draft.environment },
        { label: "deployment", value: draft.deploymentTarget, code: true },
        { label: "release", value: draft.releaseRef, code: true }
      ])
    },
    {
      label: "Gate References",
      value: renderValuePills([
        { label: "staging", value: currentScope.latestStagingGate, code: true },
        { label: "prod", value: currentScope.latestProdGate, code: true }
      ])
    },
    {
      label: "Readiness Signals",
      value: renderValuePills([
        { label: "issues", value: String(currentScope.deploymentIssueCount || 0) },
        { label: "degraded providers", value: String(currentScope.providerDegradedCount || 0) },
        { label: "warnings", value: String(currentScope.warningCount || 0) },
        { label: "secrets missing", value: String(currentScope.secretMissingCount || 0) }
      ])
    }
  ];
  return `
    <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="environment-deployment-scope">
      <div class="metric-title-row">
        <div class="title">Environment And Deployment Scope</div>
        <span class="chip chip-neutral chip-compact">bounded target</span>
      </div>
      <div class="platformops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderPlatformReadinessPreviewBoard(snapshot) {
  const simulation = snapshot?.admin?.latestSimulation;
  if (!simulation) {
    return `
      <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="readiness-impact-preview">
        <div class="metric-title-row">
          <div class="title">Readiness And Impact Preview</div>
          <span class="chip chip-neutral chip-compact">dry-run pending</span>
        </div>
        <div class="platformops-kv-list">
          <div class="platformops-row">
            <div class="platformops-row-label">Preview</div>
            <div class="platformops-row-value"><span class="platformops-empty">Run a bounded dry-run from the active promotion draft before routing it to GovernanceOps.</span></div>
          </div>
        </div>
      </article>
    `;
  }
  const rows = [
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
  ];
  const findings = Array.isArray(simulation.findings) ? simulation.findings : [];
  return `
    <article class="metric platformops-card" data-domain-root="platformops" data-platformops-panel="readiness-impact-preview">
      <div class="metric-title-row">
        <div class="title">Readiness And Impact Preview</div>
        <span class="${chipClassForTone(simulation.tone)}">${escapeHTML(simulation.tone || "info")}</span>
      </div>
      <div class="platformops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(simulation.kind || "platform")}</span>
        <span class="chip chip-neutral chip-compact">proposal=${escapeHTML(simulation.changeId || "pending")}</span>
      </div>
      <div class="platformops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="platformops-findings">
        <div class="platformops-row-label">Findings</div>
        ${
          findings.length > 0
            ? `<ul class="platformops-findings-list">${findings
                .map((item) => `<li>${escapeHTML(item)}</li>`)
                .join("")}</ul>`
            : '<div class="platformops-empty">not available</div>'
        }
      </div>
    </article>
  `;
}

export function renderPlatformWorkspace(context = {}) {
  const snapshot = createPlatformWorkspaceSnapshot(context);
  return `
    <div class="platformops-workspace" data-domain-root="platformops">
      ${renderOperationalFeedback(snapshot)}
      <div class="platformops-primary-grid">
        ${renderEnvironmentOverviewBoard(snapshot)}
        ${renderDeploymentPostureBoard(snapshot)}
        ${renderDependencyReadinessBoard(snapshot)}
        ${renderProviderRegistrationBoard(snapshot)}
        ${renderAimxsBridgeReadinessBoard(snapshot)}
        ${renderAimxsRouteBoundaryBoard(snapshot)}
        ${renderReleaseReadinessBoard(snapshot)}
        ${renderSupportPostureBoard(snapshot)}
      </div>
      <div class="platformops-admin-grid">
        ${renderPlatformAdminQueueBoard(snapshot)}
        ${renderPlatformPromotionDraftBoard(snapshot)}
        ${renderPlatformEnvironmentScopeBoard(snapshot)}
        ${renderPlatformReadinessPreviewBoard(snapshot)}
        ${renderPlatformGovernanceRouteReceiptBoard(snapshot)}
        ${renderPlatformRollbackHistoryBoard(snapshot)}
      </div>
    </div>
  `;
}
