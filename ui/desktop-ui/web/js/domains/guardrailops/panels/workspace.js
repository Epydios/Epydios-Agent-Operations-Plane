import { chipClassForStatus, escapeHTML } from "../../../views/common.js";
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

export function renderGuardrailWorkspace(context = {}) {
  const snapshot = createGuardrailWorkspaceSnapshot(context);
  return `
    <div class="guardrailops-workspace" data-domain-root="guardrailops">
      <div class="guardrailops-primary-grid">
        ${renderGuardrailPostureBoard(snapshot)}
        ${renderSandboxCapabilityBoard(snapshot)}
        ${renderQuotaAndTimeoutBoard(snapshot)}
        ${renderKillSwitchBoard(snapshot)}
        ${renderRedactionAndTransportBoard(snapshot)}
        ${renderBreakGlassPostureBoard(snapshot)}
        ${renderExecutionGatesBoard(snapshot)}
      </div>
    </div>
  `;
}
