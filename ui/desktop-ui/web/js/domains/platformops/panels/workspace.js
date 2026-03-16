import { chipClassForStatus, escapeHTML } from "../../../views/common.js";
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

export function renderPlatformWorkspace(context = {}) {
  const snapshot = createPlatformWorkspaceSnapshot(context);
  return `
    <div class="platformops-workspace" data-domain-root="platformops">
      <div class="platformops-primary-grid">
        ${renderEnvironmentOverviewBoard(snapshot)}
        ${renderDeploymentPostureBoard(snapshot)}
        ${renderDependencyReadinessBoard(snapshot)}
        ${renderProviderRegistrationBoard(snapshot)}
        ${renderAimxsBridgeReadinessBoard(snapshot)}
        ${renderReleaseReadinessBoard(snapshot)}
        ${renderSupportPostureBoard(snapshot)}
      </div>
    </div>
  `;
}
