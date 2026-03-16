import { chipClassForStatus, escapeHTML } from "../../../views/common.js";
import { createNetworkWorkspaceSnapshot } from "../state.js";

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
        <span class="networkops-value-pill">
          <span class="networkops-value-key">${escapeHTML(label)}</span>
          <span class="networkops-value-text${item?.code ? " networkops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="networkops-empty">not available</span>';
  }
  return `<div class="networkops-value-group">${values.join("")}</div>`;
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
        <div class="networkops-row">
          <div class="networkops-row-label">${escapeHTML(label)}</div>
          <div class="networkops-row-value">${value || '<span class="networkops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderEndpointPills(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      const state = String(item?.state || "").trim();
      const path = String(item?.path || "").trim();
      if (!label) {
        return "";
      }
      return `
        <div class="networkops-endpoint-pill">
          <div class="networkops-endpoint-topline">
            <span class="networkops-endpoint-label">${escapeHTML(label)}</span>
            <span class="${chipClassForStatus(state)} chip-compact">${escapeHTML(state)}</span>
          </div>
          <div class="networkops-endpoint-path">${path ? `<code>${escapeHTML(path)}</code>` : '<span class="networkops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="networkops-empty">not available</span>';
  }
  return `<div class="networkops-endpoint-group">${values.join("")}</div>`;
}

function renderTopologyPaths(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      if (!label) {
        return "";
      }
      return `
        <div class="networkops-topology-pill">
          <div class="networkops-topology-label">${escapeHTML(label)}</div>
          <div class="networkops-topology-values">
            ${renderValuePills([
              { label: "route", value: item?.route || "-", code: true },
              { label: "endpoint", value: item?.endpoint || "-", code: true },
              { label: "transport", value: item?.transport || "-", code: true }
            ])}
          </div>
        </div>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="networkops-empty">not available</span>';
  }
  return `<div class="networkops-topology-group">${values.join("")}</div>`;
}

function renderNetworkBoundaryBoard(snapshot) {
  const board = snapshot.networkBoundary;
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="network-boundary">
      <div class="metric-title-row">
        <div class="title">Network Boundary Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">mode=${escapeHTML(board.activeMode)}</span>
        <span class="chip chip-neutral chip-compact">routes=${escapeHTML(String(board.routeCount))}</span>
        <span class="chip chip-neutral chip-compact">boundaries=${escapeHTML(String(board.boundaryRequirementCount))}</span>
        <span class="chip chip-neutral chip-compact">transports=${escapeHTML(String(board.transportCount))}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Boundary Selection",
            value: renderValuePills([
              { label: "environment", value: board.environment, code: true },
              { label: "provider", value: board.selectedProviderId, code: true },
              { label: "auth", value: board.authMode }
            ])
          },
          {
            label: "Route Posture",
            value: renderValuePills([
              { label: "routing", value: board.modelRouting },
              { label: "gateway", value: board.gatewayProviderId, code: true },
              { label: "fallback", value: board.allowDirectProviderFallback ? "allowed" : "bounded" }
            ])
          },
          {
            label: "Boundary Signals",
            value: renderValuePills([
              { label: "requirements", value: String(board.boundaryRequirementCount) },
              { label: "first boundary", value: board.firstBoundaryRequirement, code: true },
              { label: "first transport", value: board.firstTransport, code: true },
              { label: "contracts", value: String(board.providerContractCount) }
            ])
          },
          {
            label: "Provider Health",
            value: renderValuePills([
              { label: "ready", value: String(board.readyProviderCount) },
              { label: "degraded", value: String(board.degradedProviderCount) },
              { label: "policy route", value: board.latestPolicyRoute, code: true },
              { label: "desktop route", value: board.latestDesktopRoute, code: true }
            ])
          },
          {
            label: "Provider Detail",
            value: renderValuePills([{ label: "detail", value: board.providersDetail }])
          }
        ])}
      </div>
    </article>
  `;
}

function renderEndpointReachabilityBoard(snapshot) {
  const board = snapshot.endpointReachability;
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="endpoint-reachability">
      <div class="metric-title-row">
        <div class="title">Endpoint Reachability Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">ok=${escapeHTML(String(board.okCount))}</span>
        <span class="chip chip-neutral chip-compact">warn=${escapeHTML(String(board.warnCount))}</span>
        <span class="chip chip-neutral chip-compact">error=${escapeHTML(String(board.errorCount))}</span>
        <span class="chip chip-neutral chip-compact">contracts=${escapeHTML(String(board.contractEndpointCount))}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Control Plane Paths",
            value: renderValuePills([
              { label: "runtime", value: board.runtimeApiBaseUrl, code: true },
              { label: "registry", value: board.registryApiBaseUrl, code: true }
            ])
          },
          {
            label: "Endpoint Summary",
            value: renderValuePills([
              { label: "total", value: String(board.totalCount) },
              { label: "ok", value: String(board.okCount) },
              { label: "warn", value: String(board.warnCount) },
              { label: "error", value: String(board.errorCount) },
              { label: "unknown", value: String(board.unknownCount) }
            ])
          },
          {
            label: "Contract Endpoints",
            value: renderValuePills([
              { label: "selected profile", value: board.selectedAgentProfileId, code: true },
              { label: "transport", value: board.selectedProfileTransport, code: true },
              { label: "profile endpoint", value: board.selectedProfileEndpointRef, code: true },
              { label: "aimxs endpoint", value: board.aimxsEndpointRef, code: true }
            ])
          },
          {
            label: "Primary Endpoints",
            value: renderEndpointPills(board.endpointSample)
          }
        ])}
      </div>
    </article>
  `;
}

function renderTrustAndCertificateBoard(snapshot) {
  const board = snapshot.trustAndCertificate;
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="trust-certificate">
      <div class="metric-title-row">
        <div class="title">Trust And Certificate Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">mode=${escapeHTML(board.activeMode)}</span>
        <span class="chip chip-neutral chip-compact">state=${escapeHTML(board.activationState)}</span>
        <span class="chip chip-neutral chip-compact">refs=${escapeHTML(String(board.secureRefConfiguredCount))}/${escapeHTML(String(board.secureRefCount))}</span>
        <span class="chip chip-neutral chip-compact">secrets missing=${escapeHTML(String(board.secureSecretMissingCount))}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Trust Contract",
            value: renderValuePills([
              { label: "provider", value: board.selectedProviderId, code: true },
              { label: "auth", value: board.authMode },
              { label: "summary", value: board.summary }
            ])
          },
          {
            label: "AIMXS Trust Material",
            value: renderValuePills([
              { label: "endpoint", value: board.aimxsEndpointRef, code: true },
              { label: "bearer", value: board.bearerTokenRef, code: true },
              { label: "client cert", value: board.clientTlsCertRef, code: true },
              { label: "client key", value: board.clientTlsKeyRef, code: true },
              { label: "provider ca", value: board.caCertRef, code: true }
            ])
          },
          {
            label: "Gateway Trust Material",
            value: renderValuePills([
              { label: "gateway cert", value: board.gatewayMtlsCertRef, code: true },
              { label: "gateway key", value: board.gatewayMtlsKeyRef, code: true },
              { label: "gateway refs", value: String(board.gatewayRefConfiguredCount) }
            ])
          },
          {
            label: "Secret And Warning Posture",
            value: renderValuePills([
              { label: "secrets present", value: String(board.secureSecretPresentCount) },
              { label: "secrets missing", value: String(board.secureSecretMissingCount) },
              { label: "warnings", value: String(board.warningCount) },
              { label: "first warning", value: board.firstWarning }
            ])
          }
        ])}
      </div>
    </article>
  `;
}

function renderIngressEgressBoard(snapshot) {
  const board = snapshot.ingressEgressPosture;
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="ingress-egress-posture">
      <div class="metric-title-row">
        <div class="title">Egress And Ingress Posture Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">ingress=${escapeHTML(String(board.ingressRequirementCount))}</span>
        <span class="chip chip-neutral chip-compact">egress=${escapeHTML(String(board.egressRequirementCount))}</span>
        <span class="chip chip-neutral chip-compact">transports=${escapeHTML(String(board.transportCount))}</span>
        <span class="chip chip-neutral chip-compact">fallback=${escapeHTML(board.directFallbackState)}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Boundary Requirements",
            value: renderValuePills([
              { label: "all", value: String(board.allRequirementCount) },
              { label: "first ingress", value: board.firstIngressRequirement, code: true },
              { label: "first egress", value: board.firstEgressRequirement, code: true }
            ])
          },
          {
            label: "Transport Posture",
            value: renderValuePills([
              { label: "selected transport", value: board.selectedProfileTransport, code: true },
              { label: "first transport", value: board.firstTransport, code: true },
              { label: "auth", value: board.authMode },
              { label: "security", value: board.secureMode }
            ])
          },
          {
            label: "Bounded Route Posture",
            value: renderValuePills([
              { label: "policy", value: board.latestPolicyRoute, code: true },
              { label: "evidence", value: board.latestEvidenceRoute, code: true },
              { label: "desktop", value: board.latestDesktopRoute, code: true },
              { label: "warnings", value: String(board.warningCount) }
            ])
          },
          {
            label: "Provider Detail",
            value: renderValuePills([{ label: "detail", value: board.providersDetail }])
          }
        ])}
      </div>
    </article>
  `;
}

function renderTopologyBoard(snapshot) {
  const board = snapshot.connectivityTopology;
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="connectivity-topology">
      <div class="metric-title-row">
        <div class="title">Connectivity Topology Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">endpoints=${escapeHTML(String(board.endpointCount))}</span>
        <span class="chip chip-neutral chip-compact">providers=${escapeHTML(String(board.providerCount))}</span>
        <span class="chip chip-neutral chip-compact">routes=${escapeHTML(String(board.routeCount))}</span>
        <span class="chip chip-neutral chip-compact">contracts=${escapeHTML(String(board.contractCount))}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Topology Summary",
            value: renderValuePills([
              { label: "reachable endpoints", value: String(board.reachableEndpointCount) },
              { label: "ready providers", value: String(board.readyProviderCount) },
              { label: "degraded providers", value: String(board.degradedProviderCount) },
              { label: "transports", value: String(board.transportCount) }
            ])
          },
          {
            label: "Bounded Paths",
            value: renderTopologyPaths(board.topologyPaths)
          }
        ])}
      </div>
    </article>
  `;
}

export function renderNetworkWorkspace(context = {}) {
  const snapshot = createNetworkWorkspaceSnapshot(context);
  return `
    <section class="networkops-workspace stack" data-domain-root="networkops">
      <div class="networkops-primary-grid">
        ${renderNetworkBoundaryBoard(snapshot)}
        ${renderEndpointReachabilityBoard(snapshot)}
        ${renderTrustAndCertificateBoard(snapshot)}
      </div>
      <div class="networkops-secondary-grid">
        ${renderIngressEgressBoard(snapshot)}
        ${renderTopologyBoard(snapshot)}
      </div>
    </section>
  `;
}
