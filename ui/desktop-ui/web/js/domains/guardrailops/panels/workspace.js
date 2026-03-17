import { chipClassForStatus, escapeHTML, renderPanelStateMetric } from "../../../views/common.js";
import { renderAimxsIdentityPostureBlock } from "../../../shared/components/aimxs-identity-posture.js";
import { createGuardrailWorkspaceSnapshot } from "../state.js";

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
        <span class="guardrailops-value-pill">
          <span class="guardrailops-value-key">${escapeHTML(label)}</span>
          <span class="guardrailops-value-text${item?.code ? " guardrailops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="guardrailops-empty">not available</span>';
  }
  return `<div class="guardrailops-value-group">${values.join("")}</div>`;
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
        <div class="guardrailops-row">
          <div class="guardrailops-row-label">${escapeHTML(label)}</div>
          <div class="guardrailops-row-value">${value || '<span class="guardrailops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
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
      ? "Guardrail change failed"
      : feedback.tone === "ok"
        ? "Guardrail change updated"
        : feedback.tone === "warn"
          ? "Guardrail handoff required"
          : "Guardrail draft updated";
  return `
    <div class="guardrailops-feedback-shell" data-guardrailops-panel="operational-feedback">
      ${renderPanelStateMetric(tone, title, feedback.message)}
    </div>
  `;
}

function guardrailAdminStatusChipClass(status = "") {
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

function renderGuardrailAdminActionRow(attrs = "") {
  return `
    <div class="guardrailops-action-row">
      <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="save-draft"${attrs}>Save Draft</button>
      <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="simulate-draft"${attrs}>Run Dry-Run</button>
      <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="route-draft"${attrs}>Route To Governance</button>
    </div>
  `;
}

function renderGuardrailPostureBoard(snapshot) {
  const board = snapshot.guardrailPosture;
  const rows = [
    {
      label: "Current Posture",
      value: renderValuePills([
        { label: "terminal", value: board.terminalMode },
        { label: "execution profile", value: board.latestExecutionProfile, code: true },
        { label: "decision", value: board.latestDecision || "-" },
        { label: "run status", value: board.latestRunStatus || "-" }
      ])
    },
    {
      label: "Current Scope",
      value: renderValuePills([
        { label: "tenant", value: board.latestRunTenant, code: true },
        { label: "project", value: board.latestRunProject, code: true },
        { label: "desktop provider", value: board.latestDesktopProvider, code: true },
        { label: "target os", value: board.latestTargetOs }
      ])
    },
    {
      label: "Pressure Signals",
      value: renderValuePills([
        { label: "pending approvals", value: String(board.pendingApprovalCount || 0) },
        { label: "profiles", value: String(board.enforcementProfileCount || 0) },
        { label: "break-glass gates", value: String(board.breakGlassGateCount || 0) },
        { label: "run", value: board.latestRunId || "-", code: true }
      ])
    }
  ];
  return `
    <article class="metric guardrailops-card" data-domain-root="guardrailops" data-guardrailops-panel="guardrail-posture">
      <div class="metric-title-row">
        <div class="title">Guardrail Posture</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone || "neutral")}</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">terminal=${escapeHTML(board.terminalMode)}</span>
        <span class="${chipClassForStatus(board.latestDecision || "unknown")} chip-compact">decision</span>
        <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(board.pendingApprovalCount || 0))}</span>
      </div>
      <div class="guardrailops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderAimxsIdentityPostureBoard(snapshot) {
  return `
    <article class="metric guardrailops-card guardrailops-card-wide" data-domain-root="guardrailops" data-guardrailops-panel="aimxs-identity-posture">
      <div class="metric-title-row">
        <div class="title">AIMXS Identity And Posture</div>
        <span class="chip chip-ok chip-compact">primary</span>
      </div>
      ${renderAimxsIdentityPostureBlock(snapshot.aimxsIdentityPosture)}
    </article>
  `;
}

function renderSandboxCapabilityBoard(snapshot) {
  const board = snapshot.sandboxCapability;
  const rows = [
    {
      label: "Sandbox Mode",
      value: renderValuePills([
        { label: "terminal", value: board.terminalMode },
        { label: "profile", value: board.latestExecutionProfile, code: true },
        { label: "target os", value: board.latestTargetOs },
        { label: "restricted host", value: board.restrictedHostOptIn ? "opted in" : "not enabled" }
      ])
    },
    {
      label: "Requested Capability Scope",
      value: renderValuePills([
        { label: "requested", value: String(board.requestedCapabilityCount || 0) },
        { label: "first", value: board.firstRequestedCapability || "-", code: true },
        { label: "verifiers", value: String(board.requiredVerifierCount || 0) },
        { label: "boundaries", value: String(board.boundaryRequirementCount || 0) }
      ])
    },
    {
      label: "Worker Coverage",
      value: renderValuePills([
        { label: "profiles", value: String(board.workerProfileCount || 0) },
        { label: "managed", value: String(board.managedAgentCount || 0) },
        { label: "model invoke", value: String(board.modelInvokeCount || 0) },
        { label: "source", value: board.source || "-" }
      ])
    },
    {
      label: "Latest Worker",
      value: renderValuePills([
        { label: "label", value: board.latestWorkerLabel || "-", code: true },
        { label: "provider", value: board.latestWorkerProvider || "-", code: true },
        { label: "transport", value: board.latestWorkerTransport || "-" },
        { label: "model", value: board.latestWorkerModel || "-", code: true }
      ])
    }
  ];
  return `
    <article class="metric guardrailops-card" data-domain-root="guardrailops" data-guardrailops-panel="sandbox-capability">
      <div class="metric-title-row">
        <div class="title">Sandbox And Capability</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone || "neutral")}</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">profiles=${escapeHTML(String(board.workerProfileCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">requested=${escapeHTML(String(board.requestedCapabilityCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">transport=${escapeHTML(board.latestWorkerTransport || "-")}</span>
      </div>
      <div class="guardrailops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderExecutionGatesBoard(snapshot) {
  const board = snapshot.executionGates;
  const rows = [
    {
      label: "Approval Gate",
      value: renderValuePills([
        { label: "pending", value: String(board.pendingApprovalCount || 0) },
        { label: "approval", value: board.latestApprovalId || "-", code: true },
        { label: "run", value: board.latestApprovalRunId || "-", code: true },
        { label: "tier", value: board.latestApprovalTier || "0" }
      ])
    },
    {
      label: "Policy And Grant",
      value: renderValuePills([
        { label: "grant token", value: board.latestGrantTokenPresent ? "present" : "missing" },
        { label: "grant sha", value: board.latestGrantTokenPresent ? board.latestGrantTokenSha256 : "-", code: true },
        { label: "boundaries", value: String(board.boundaryRequirementCount || 0) },
        { label: "first boundary", value: board.firstBoundaryRequirement || "-", code: true }
      ])
    },
    {
      label: "Execution Gate Inventory",
      value: renderValuePills([
        { label: "profiles", value: String(board.enforcementProfileCount || 0) },
        { label: "scope guards", value: String(board.scopeGuardCount || 0) },
        { label: "break-glass", value: String(board.breakGlassGateCount || 0) },
        { label: "quota", value: String(board.quotaGateCount || 0) }
      ])
    },
    {
      label: "Latest Gate Context",
      value: renderValuePills([
        { label: "target profile", value: board.latestApprovalTargetProfile || "-", code: true },
        { label: "scope gate", value: board.scopeGuardPresent ? "present" : "not declared" },
        { label: "runtime authz", value: board.runtimeAuthzPresent ? "present" : "not declared" },
        { label: "redaction", value: board.exportRedactionPresent ? "present" : "not declared" }
      ])
    },
    {
      label: "Latest Approval Reason",
      value: escapeHTML(board.latestApprovalReason || "-")
    }
  ];
  return `
    <article class="metric guardrailops-card guardrailops-card-wide" data-domain-root="guardrailops" data-guardrailops-panel="execution-gates">
      <div class="metric-title-row">
        <div class="title">Execution Gates</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone || "neutral")}</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(board.pendingApprovalCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">scope guards=${escapeHTML(String(board.scopeGuardCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">break-glass=${escapeHTML(String(board.breakGlassGateCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">first=${escapeHTML(board.firstEnforcementLabel || "-")}</span>
      </div>
      <div class="guardrailops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderQuotaAndTimeoutBoard(snapshot) {
  const board = snapshot.quotaAndTimeout;
  const rows = [
    {
      label: "Quota Overlay Surface",
      value: renderValuePills([
        { label: "overlay", value: board.latestQuotaOverlayLabel || "-", code: true },
        { label: "mode", value: board.latestQuotaOverlayMode || "-", code: true },
        { label: "quota gates", value: String(board.quotaGateCount || 0) },
        { label: "chargeback", value: String(board.chargebackOverlayCount || 0) }
      ])
    },
    {
      label: "Quota Dimensions",
      value: renderValuePills([
        { label: "dimensions", value: String(board.quotaDimensionCount || 0) },
        { label: "first", value: board.firstQuotaDimension || "-", code: true },
        { label: "inputs", value: String(board.quotaInputCount || 0) },
        { label: "first input", value: board.firstQuotaInput || "-", code: true }
      ])
    },
    {
      label: "Timeout Window",
      value: renderValuePills([
        { label: "approval", value: board.latestApprovalId || "-", code: true },
        { label: "expires", value: board.latestApprovalExpiresAt || "-", code: true },
        { label: "window", value: board.approvalWindow || "-" },
        { label: "timeboxed", value: String(board.timeboxedGateCount || 0) }
      ])
    },
    {
      label: "Escalation Coverage",
      value: renderValuePills([
        { label: "overlays", value: String(board.overlayProfileCount || 0) },
        { label: "break-glass bundles", value: String(board.breakGlassBundleCount || 0) },
        { label: "quota gates", value: String(board.quotaGateCount || 0) },
        { label: "timeboxes", value: String(board.timeboxedGateCount || 0) }
      ])
    }
  ];
  return `
    <article class="metric guardrailops-card" data-domain-root="guardrailops" data-guardrailops-panel="quota-timeout">
      <div class="metric-title-row">
        <div class="title">Quota And Timeout</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone || "neutral")}</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">quota=${escapeHTML(String(board.quotaGateCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">timeboxed=${escapeHTML(String(board.timeboxedGateCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">overlays=${escapeHTML(String(board.overlayProfileCount || 0))}</span>
      </div>
      <div class="guardrailops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderKillSwitchBoard(snapshot) {
  const board = snapshot.killSwitch;
  const rows = [
    {
      label: "Stop Posture",
      value: renderValuePills([
        { label: "terminal", value: board.terminalMode || "-" },
        { label: "restricted host", value: board.restrictedHostMode || "-" },
        { label: "execution profile", value: board.latestExecutionProfile || "-", code: true },
        { label: "hard stops", value: String(board.currentHardStopCount || 0) }
      ])
    },
    {
      label: "Active Hard Stops",
      value: renderValuePills([
        { label: "approval hold", value: board.approvalHoldPresent ? "present" : "clear" },
        { label: "restricted host", value: board.restrictedHostBlocked ? "blocked" : "clear" },
        { label: "read only", value: board.readOnlyStopPresent ? "active" : "clear" },
        { label: "policy stop", value: board.policyBlockedPresent ? "present" : "clear" }
      ])
    },
    {
      label: "Latest Stop Context",
      value: renderValuePills([
        { label: "run", value: board.latestRunId || "-", code: true },
        { label: "status", value: board.latestRunStatus || "-" },
        { label: "decision", value: board.latestDecision || "-" },
        { label: "approval", value: board.latestApprovalId || "-", code: true }
      ])
    },
    {
      label: "Latest Stop Reason",
      value: escapeHTML(board.latestApprovalReason || "-")
    }
  ];
  return `
    <article class="metric guardrailops-card" data-domain-root="guardrailops" data-guardrailops-panel="kill-switch">
      <div class="metric-title-row">
        <div class="title">Kill Switch</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone || "neutral")}</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">hard-stops=${escapeHTML(String(board.currentHardStopCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">terminal=${escapeHTML(board.terminalMode || "-")}</span>
        <span class="chip chip-neutral chip-compact">restricted=${escapeHTML(board.restrictedHostMode || "-")}</span>
      </div>
      <div class="guardrailops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderRedactionAndTransportBoard(snapshot) {
  const board = snapshot.redactionAndTransport;
  const rows = [
    {
      label: "Governed Export Guards",
      value: renderValuePills([
        { label: "desktop profiles", value: String(board.desktopExportProfileCount || 0) },
        { label: "structured", value: String(board.structuredRedactionCount || 0) },
        { label: "text", value: String(board.textRedactionCount || 0) },
        { label: "boundary", value: board.redactionBoundaryPresent ? "present" : "not declared" }
      ])
    },
    {
      label: "Desktop Export Profile",
      value: renderValuePills([
        { label: "label", value: board.firstDesktopExportProfileLabel || "-", code: true },
        { label: "redaction", value: board.firstDesktopRedactionMode || "-" },
        { label: "channels", value: String(board.deliveryChannelCount || 0) },
        { label: "first channel", value: board.firstDeliveryChannel || "-", code: true }
      ])
    },
    {
      label: "Selected Provider Contract",
      value: renderValuePills([
        { label: "label", value: board.selectedProviderLabel || "-", code: true },
        { label: "transport", value: board.selectedProviderTransport || "-" },
        { label: "scope", value: board.selectedProviderScope || "-" },
        { label: "model", value: board.selectedProviderModel || "-", code: true }
      ])
    },
    {
      label: "Latest Worker Route",
      value: renderValuePills([
        { label: "provider", value: board.latestWorkerProvider || "-", code: true },
        { label: "transport", value: board.latestWorkerTransport || "-" },
        { label: "model", value: board.latestWorkerModel || "-", code: true },
        { label: "profiles", value: String(board.exportProfileCount || 0) }
      ])
    }
  ];
  return `
    <article class="metric guardrailops-card" data-domain-root="guardrailops" data-guardrailops-panel="redaction-transport">
      <div class="metric-title-row">
        <div class="title">Redaction And Transport Guards</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone || "neutral")}</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">desktop=${escapeHTML(String(board.desktopExportProfileCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">transport=${escapeHTML(board.selectedProviderTransport || "-")}</span>
        <span class="chip chip-neutral chip-compact">redaction=${escapeHTML(board.firstDesktopRedactionMode || "-")}</span>
      </div>
      <div class="guardrailops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderBreakGlassPostureBoard(snapshot) {
  const board = snapshot.breakGlassPosture;
  const rows = [
    {
      label: "Escalation Surface",
      value: renderValuePills([
        { label: "gates", value: String(board.breakGlassGateCount || 0) },
        { label: "timeboxed", value: String(board.timeboxedGateCount || 0) },
        { label: "bundles", value: String(board.breakGlassBundleCount || 0) },
        { label: "first bundle", value: board.firstBreakGlassBundle || "-", code: true }
      ])
    },
    {
      label: "Activation Path",
      value: renderValuePills([
        { label: "surfaces", value: String(board.breakGlassSurfaceCount || 0) },
        { label: "first surface", value: board.firstBreakGlassSurface || "-", code: true },
        { label: "inputs", value: String(board.breakGlassRequiredInputCount || 0) },
        { label: "first input", value: board.firstBreakGlassInput || "-", code: true }
      ])
    },
    {
      label: "Current Timebox",
      value: renderValuePills([
        { label: "approval", value: board.latestApprovalId || "-", code: true },
        { label: "expires", value: board.latestApprovalExpiresAt || "-", code: true },
        { label: "window", value: board.approvalWindow || "-" },
        { label: "run", value: board.latestRunId || "-", code: true }
      ])
    },
    {
      label: "Latest Approval Reason",
      value: escapeHTML(board.latestApprovalReason || "-")
    }
  ];
  return `
    <article class="metric guardrailops-card" data-domain-root="guardrailops" data-guardrailops-panel="break-glass-posture">
      <div class="metric-title-row">
        <div class="title">Break-Glass Posture</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone || "neutral")}</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">gates=${escapeHTML(String(board.breakGlassGateCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">timeboxed=${escapeHTML(String(board.timeboxedGateCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">bundles=${escapeHTML(String(board.breakGlassBundleCount || 0))}</span>
      </div>
      <div class="guardrailops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderGuardrailAdminQueueBoard(snapshot) {
  const admin = snapshot.admin || {};
  const items = Array.isArray(admin.queueItems) ? admin.queueItems : [];
  const selectedChangeId = String(admin.selectedChangeId || "").trim();
  const queueMarkup =
    items.length > 0
      ? items
          .map((item) => {
            const id = String(item?.id || "").trim();
            const selected = id && id === selectedChangeId;
            const status = String(item?.status || "").trim().toLowerCase();
            const rollbackStatus = String(item?.rollback?.status || "").trim().toLowerCase();
            const alreadyInGovernance = ["routed", "approved", "applied", "denied", "deferred", "escalated", "rolled_back"].includes(status);
            const routeAction = alreadyInGovernance ? "open-governance" : "route-queue-item";
            const routeLabel = alreadyInGovernance ? "Open GovernanceOps" : "Route To Governance";
            return `
              <article class="guardrailops-queue-card${selected ? " guardrailops-queue-card-selected" : ""}">
                <div class="metric-title-row">
                  <div class="title">${escapeHTML(String(item?.label || "Guardrail Change Draft").trim())}</div>
                  <span class="${guardrailAdminStatusChipClass(status)}">${escapeHTML(status || "draft")}</span>
                </div>
                <div class="guardrailops-chip-row">
                  <span class="chip chip-neutral chip-compact">change=${escapeHTML(id || "-")}</span>
                  <span class="chip chip-neutral chip-compact">kind=${escapeHTML(String(item?.changeKind || "-").trim() || "-")}</span>
                  <span class="chip chip-neutral chip-compact">profile=${escapeHTML(String(item?.executionProfile || "-").trim() || "-")}</span>
                  ${item?.decision?.approvalReceiptId ? '<span class="chip chip-ok chip-compact">decision receipt</span>' : ""}
                  ${item?.receipt?.receiptId ? '<span class="chip chip-ok chip-compact">admin receipt</span>' : ""}
                  ${rollbackStatus ? `<span class="${guardrailAdminStatusChipClass(rollbackStatus)}">${escapeHTML(rollbackStatus)}</span>` : ""}
                </div>
                <div class="guardrailops-kv-list">
                  ${renderKeyValueRows([
                    {
                      label: "Draft Scope",
                      value: renderValuePills([
                        { label: "scope", value: String(item?.targetScope || "-").trim() || "-", code: true },
                        { label: "boundary", value: String(item?.safetyBoundary || "-").trim() || "-", code: true },
                        { label: "state", value: String(item?.proposedState || "-").trim() || "-" },
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
                      label: "Recovery",
                      value: escapeHTML(String(item?.rollback?.summary || "").trim() || "pending")
                    }
                  ])}
                </div>
                <div class="guardrailops-action-row">
                  <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="select-queue-item" data-guardrailops-admin-id="${escapeHTML(id)}">Select Proposal</button>
                  <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="simulate-queue-item" data-guardrailops-admin-id="${escapeHTML(id)}">Refresh Dry-Run</button>
                  <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="${escapeHTML(routeAction)}" data-guardrailops-admin-id="${escapeHTML(id)}">${escapeHTML(routeLabel)}</button>
                </div>
              </article>
            `;
          })
          .join("")
      : `
          <div class="guardrailops-kv-list">
            <div class="guardrailops-row">
              <div class="guardrailops-row-label">Status</div>
              <div class="guardrailops-row-value"><span class="guardrailops-empty">No guardrail admin proposal is queued yet.</span></div>
            </div>
          </div>
        `;

  return `
    <article class="metric guardrailops-card guardrailops-card-wide" data-domain-root="guardrailops" data-guardrailops-panel="admin-change-queue">
      <div class="metric-title-row">
        <div class="title">Admin Change Queue</div>
        <span class="chip chip-neutral chip-compact">apply-gated</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">queued=${escapeHTML(String(items.length))}</span>
        <span class="chip chip-neutral chip-compact">selected=${escapeHTML(selectedChangeId || "none")}</span>
      </div>
      <div class="guardrailops-queue-grid">${queueMarkup}</div>
    </article>
  `;
}

function renderGuardrailChangeDraftBoard(snapshot) {
  const admin = snapshot.admin || {};
  const draft = admin.draft || {};
  return `
    <article class="metric guardrailops-card" data-domain-root="guardrailops" data-guardrailops-panel="guardrail-change-draft">
      <div class="metric-title-row">
        <div class="title">Guardrail Change Draft</div>
        <span class="chip chip-neutral chip-compact">proposal</span>
      </div>
      <div class="guardrailops-draft-grid">
        <label class="field">
          <span class="label">Change Kind</span>
          <select class="filter-select" data-guardrailops-draft-field="changeKind">
            <option value="tighten"${draft.changeKind === "tighten" ? " selected" : ""}>Tighten</option>
            <option value="relax"${draft.changeKind === "relax" ? " selected" : ""}>Relax</option>
            <option value="break_glass"${draft.changeKind === "break_glass" ? " selected" : ""}>Break-Glass</option>
            <option value="transport_review"${draft.changeKind === "transport_review" ? " selected" : ""}>Transport Review</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Target Scope</span>
          <input class="filter-input" type="text" value="${escapeHTML(draft.targetScope || "")}" data-guardrailops-draft-field="targetScope" />
        </label>
        <label class="field">
          <span class="label">Execution Profile</span>
          <input class="filter-input" type="text" value="${escapeHTML(draft.executionProfile || "")}" data-guardrailops-draft-field="executionProfile" />
        </label>
        <label class="field">
          <span class="label">Safety Boundary</span>
          <input class="filter-input" type="text" value="${escapeHTML(draft.safetyBoundary || "")}" data-guardrailops-draft-field="safetyBoundary" />
        </label>
        <label class="field">
          <span class="label">Proposed State</span>
          <input class="filter-input" type="text" value="${escapeHTML(draft.proposedState || "")}" data-guardrailops-draft-field="proposedState" />
        </label>
        <label class="field guardrailops-field-wide">
          <span class="label">Reason</span>
          <textarea class="composer-textarea" rows="3" data-guardrailops-draft-field="reason">${escapeHTML(draft.reason || "")}</textarea>
        </label>
      </div>
      ${renderGuardrailAdminActionRow()}
    </article>
  `;
}

function renderExecutionScopeBoundaryBoard(snapshot) {
  const admin = snapshot.admin || {};
  const draft = admin.draft || {};
  const currentScope = admin.currentScope || {};
  const rows = [
    {
      label: "Current Execution Scope",
      value: renderValuePills([
        { label: "scope", value: currentScope.targetScope || "-", code: true },
        { label: "profile", value: currentScope.executionProfile || "-", code: true },
        { label: "terminal", value: currentScope.terminalMode || "-" },
        { label: "restricted host", value: currentScope.restrictedHostMode || "-" }
      ])
    },
    {
      label: "Draft Boundary",
      value: renderValuePills([
        { label: "change", value: draft.changeKind || "-" },
        { label: "scope", value: draft.targetScope || "-", code: true },
        { label: "boundary", value: draft.safetyBoundary || "-", code: true },
        { label: "state", value: draft.proposedState || "-" }
      ])
    },
    {
      label: "Safety Signals",
      value: renderValuePills([
        { label: "pending approvals", value: String(currentScope.pendingApprovalCount || 0) },
        { label: "hard stops", value: String(currentScope.currentHardStopCount || 0) },
        { label: "break-glass gates", value: String(currentScope.breakGlassGateCount || 0) },
        { label: "quota gates", value: String(currentScope.quotaGateCount || 0) }
      ])
    },
    {
      label: "Transport And Redaction",
      value: renderValuePills([
        { label: "redaction boundary", value: currentScope.redactionBoundaryPresent ? "present" : "not declared" },
        { label: "channel", value: currentScope.firstDeliveryChannel || "-", code: true },
        { label: "provider transport", value: currentScope.selectedProviderTransport || "-" },
        { label: "run", value: currentScope.latestRunId || "-", code: true }
      ])
    }
  ];
  return `
    <article class="metric guardrailops-card" data-domain-root="guardrailops" data-guardrailops-panel="execution-scope-boundary">
      <div class="metric-title-row">
        <div class="title">Execution Scope And Safety Boundary</div>
        <span class="chip chip-neutral chip-compact">bounded target</span>
      </div>
      <div class="guardrailops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderImpactPreviewBoard(snapshot) {
  const simulation = snapshot?.admin?.latestSimulation;
  if (!simulation) {
    return `
      <article class="metric guardrailops-card" data-domain-root="guardrailops" data-guardrailops-panel="impact-preview">
        <div class="metric-title-row">
          <div class="title">Impact Preview</div>
          <span class="chip chip-neutral chip-compact">dry-run pending</span>
        </div>
        <div class="guardrailops-kv-list">
          <div class="guardrailops-row">
            <div class="guardrailops-row-label">Preview</div>
            <div class="guardrailops-row-value"><span class="guardrailops-empty">Run a bounded dry-run from the active guardrail draft before routing it to GovernanceOps.</span></div>
          </div>
        </div>
      </article>
    `;
  }
  const findings = Array.isArray(simulation.findings) ? simulation.findings : [];
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
  return `
    <article class="metric guardrailops-card" data-domain-root="guardrailops" data-guardrailops-panel="impact-preview">
      <div class="metric-title-row">
        <div class="title">Impact Preview</div>
        <span class="${chipClassForTone(simulation.tone)}">${escapeHTML(simulation.tone || "info")}</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(simulation.kind || "guardrail")}</span>
        <span class="chip chip-neutral chip-compact">proposal=${escapeHTML(simulation.changeId || "pending")}</span>
      </div>
      <div class="guardrailops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="guardrailops-findings">
        <div class="guardrailops-row-label">Findings</div>
        ${
          findings.length > 0
            ? `<ul class="guardrailops-findings-list">${findings.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`
            : '<div class="guardrailops-empty">not available</div>'
        }
      </div>
    </article>
  `;
}

function renderGuardrailGovernanceRouteReceiptBoard(snapshot) {
  const item = snapshot?.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric guardrailops-card guardrailops-card-wide" data-domain-root="guardrailops" data-guardrailops-panel="governance-route-receipt">
        <div class="metric-title-row">
          <div class="title">Governance Route And Receipt</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="guardrailops-kv-list">
          <div class="guardrailops-row">
            <div class="guardrailops-row-label">Status</div>
            <div class="guardrailops-row-value"><span class="guardrailops-empty">Select or queue a guardrail admin proposal to review governance status, apply posture, and receipt state.</span></div>
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
    <article class="metric guardrailops-card guardrailops-card-wide" data-domain-root="guardrailops" data-guardrailops-panel="governance-route-receipt">
      <div class="metric-title-row">
        <div class="title">Governance Route And Receipt</div>
        <span class="${guardrailAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(item.id)}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(item.kind || "guardrail")}</span>
        ${decision?.approvalReceiptId ? '<span class="chip chip-ok chip-compact">approval receipt</span>' : '<span class="chip chip-neutral chip-compact">decision pending</span>'}
        ${receipt?.receiptId ? '<span class="chip chip-ok chip-compact">admin receipt</span>' : '<span class="chip chip-neutral chip-compact">apply pending</span>'}
        ${rollback?.rollbackId ? `<span class="${guardrailAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "rollback")}</span>` : '<span class="chip chip-neutral chip-compact">recovery pending</span>'}
      </div>
      <div class="guardrailops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="guardrailops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="open-governance" data-guardrailops-admin-id="${escapeHTML(item.id)}">Open GovernanceOps</button>
        <button class="btn btn-ok btn-small" type="button" data-guardrailops-admin-action="apply-approved-change" data-guardrailops-admin-id="${escapeHTML(item.id)}"${canApply ? "" : " disabled"}>Apply Approved Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="copy-governance-receipt" data-guardrailops-admin-id="${escapeHTML(item.id)}"${decision?.approvalReceiptId ? "" : " disabled"}>Copy Governance Receipt</button>
        <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="copy-admin-receipt" data-guardrailops-admin-id="${escapeHTML(item.id)}"${receipt?.receiptId ? "" : " disabled"}>Copy Admin Receipt</button>
      </div>
    </article>
  `;
}

function renderGuardrailRollbackHistoryBoard(snapshot) {
  const item = snapshot?.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric guardrailops-card guardrailops-card-wide" data-domain-root="guardrailops" data-guardrailops-panel="rollback-history">
        <div class="metric-title-row">
          <div class="title">Rollback And History</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="guardrailops-kv-list">
          <div class="guardrailops-row">
            <div class="guardrailops-row-label">Status</div>
            <div class="guardrailops-row-value"><span class="guardrailops-empty">Select an applied guardrail admin proposal to review recovery posture, bounded history, and rollback actions.</span></div>
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
      ? `<div class="guardrailops-history-list">${historyItems
          .map(
            (entry) => `
              <div class="guardrailops-history-item">
                <div class="guardrailops-history-stage">${escapeHTML(entry.label)}</div>
                <div class="guardrailops-history-time">${escapeHTML(entry.at || "-")}</div>
                <div class="guardrailops-history-summary">${escapeHTML(entry.summary || "-")}</div>
              </div>
            `
          )
          .join("")}</div>`
      : '<div class="guardrailops-empty">No bounded guardrail admin history is available yet.</div>';

  return `
    <article class="metric guardrailops-card guardrailops-card-wide" data-domain-root="guardrailops" data-guardrailops-panel="rollback-history">
      <div class="metric-title-row">
        <div class="title">Rollback And History</div>
        <span class="${guardrailAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="guardrailops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(item.id)}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(item.kind || "guardrail")}</span>
        ${rollback?.rollbackId ? `<span class="${guardrailAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "rollback")}</span>` : `<span class="chip chip-neutral chip-compact">${escapeHTML(canRollback ? "rollback available" : "recovery pending")}</span>`}
      </div>
      <div class="guardrailops-kv-list">
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
            value: rollback?.reason ? escapeHTML(rollback.reason) : '<span class="guardrailops-empty">A bounded reason is required before rollback can execute.</span>'
          },
          {
            label: "Stable History",
            value: historyMarkup
          }
        ])}
      </div>
      <label class="field guardrailops-field-wide">
        <span class="label">Rollback Reason</span>
        <input
          class="filter-input"
          type="text"
          value="${escapeHTML(recoveryReason)}"
          placeholder="required; explain the rollback action"
          data-guardrailops-admin-recovery-reason
        />
      </label>
      <div class="guardrailops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="rollback-applied-change" data-guardrailops-admin-id="${escapeHTML(item.id)}"${canRollback ? "" : " disabled"}>Rollback Applied Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-guardrailops-admin-action="copy-rollback-receipt" data-guardrailops-admin-id="${escapeHTML(item.id)}"${rollback?.rollbackId ? "" : " disabled"}>Copy Rollback Receipt</button>
      </div>
    </article>
  `;
}

export function renderGuardrailWorkspace(context = {}) {
  const snapshot = createGuardrailWorkspaceSnapshot(context);
  return `
    <div class="guardrailops-workspace" data-domain-root="guardrailops">
      ${renderOperationalFeedback(snapshot)}
      <div class="guardrailops-primary-grid">
        ${renderGuardrailPostureBoard(snapshot)}
        ${renderAimxsIdentityPostureBoard(snapshot)}
        ${renderSandboxCapabilityBoard(snapshot)}
        ${renderQuotaAndTimeoutBoard(snapshot)}
        ${renderKillSwitchBoard(snapshot)}
        ${renderRedactionAndTransportBoard(snapshot)}
        ${renderBreakGlassPostureBoard(snapshot)}
        ${renderExecutionGatesBoard(snapshot)}
      </div>
      <div class="guardrailops-admin-grid">
        ${renderGuardrailAdminQueueBoard(snapshot)}
        ${renderGuardrailChangeDraftBoard(snapshot)}
        ${renderExecutionScopeBoundaryBoard(snapshot)}
        ${renderImpactPreviewBoard(snapshot)}
        ${renderGuardrailGovernanceRouteReceiptBoard(snapshot)}
        ${renderGuardrailRollbackHistoryBoard(snapshot)}
      </div>
    </div>
  `;
}
