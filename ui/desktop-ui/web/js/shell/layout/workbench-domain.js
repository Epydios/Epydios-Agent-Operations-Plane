import { chipClassForStatus, escapeHTML } from "../../views/common.js";

function normalizeClassName(value = "") {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function joinClasses(...values) {
  return values
    .flatMap((value) => normalizeClassName(value).split(/\s+/).filter(Boolean))
    .join(" ");
}

function renderArrivalChip(label = "", tone = "neutral") {
  const normalizedLabel = String(label || "").trim();
  if (!normalizedLabel) {
    return "";
  }
  return `<span class="${chipClassForStatus(tone)} chip-compact">${escapeHTML(normalizedLabel)}</span>`;
}

function renderArrivalNeutralChip(label = "", value = "") {
  const normalizedLabel = String(label || "").trim();
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }
  return `<span class="chip chip-neutral chip-compact">${escapeHTML(
    normalizedLabel ? `${normalizedLabel}=${normalizedValue}` : normalizedValue
  )}</span>`;
}

function renderArrivalSpineAnchor(anchor = {}, key = "") {
  const normalizedKey = String(key || anchor.id || "").trim().toLowerCase() || "anchor";
  return `
    <div class="workbench-arrival-context-detail" data-workbench-arrival-anchor="${escapeHTML(normalizedKey)}">
      <div class="title">${escapeHTML(anchor.title || normalizedKey)}</div>
      <div class="meta">
        <span class="${chipClassForStatus(anchor.tone || "neutral")} chip-compact">${escapeHTML(anchor.label || "-")}</span>
      </div>
      <div class="meta">${escapeHTML(anchor.summary || "-")}</div>
      <div class="meta">${escapeHTML(anchor.meta || "-")}</div>
    </div>
  `;
}

function resolveWorkbenchArrivalSpine(handoff = {}) {
  if (handoff?.spine && typeof handoff.spine === "object") {
    return handoff.spine;
  }
  const proof = handoff.proof && typeof handoff.proof === "object" ? handoff.proof : {};
  const receipt = handoff.receipt && typeof handoff.receipt === "object" ? handoff.receipt : {};
  const incidentPackageId = String(handoff.incidentPackageId || "").trim();
  const incidentId = String(handoff.incidentId || "").trim();
  const incidentStatus = String(handoff.incidentStatus || "").trim();
  return {
    decision: {
      id: "decision",
      title: "Decision",
      tone: receipt.tone || proof.tone || "neutral",
      label: String(handoff.kind || "handoff").trim() || "handoff",
      summary: String(
        handoff.arrivalRationale || "Companion opened this workspace because the governed item needs deeper review."
      ),
      meta:
        [
          handoff.runId ? `run=${handoff.runId}` : "",
          handoff.approvalId ? `approval=${handoff.approvalId}` : "",
          handoff.checkpointId ? `checkpoint=${handoff.checkpointId}` : "",
          handoff.sourceClient ? `client=${handoff.sourceClient}` : ""
        ]
          .filter(Boolean)
          .join("; ") || "The same governed item stays attached here."
    },
    receipt: {
      id: "receipt",
      title: "Receipt",
      tone: receipt.tone || "neutral",
      label: receipt.label || "Receipt attached",
      summary: receipt.summary || "Receipt context stays attached from the active path.",
      meta:
        [
          handoff.approvalId ? `approval=${handoff.approvalId}` : "",
          handoff.gatewayRequestId ? `gatewayRequest=${handoff.gatewayRequestId}` : ""
        ]
          .filter(Boolean)
          .join("; ") || "Companion keeps receipt context attached into deeper review."
    },
    proof: {
      id: "proof",
      title: "Proof",
      tone: proof.tone || "neutral",
      label: proof.label || "Proof attached",
      summary: proof.summary || "Proof context stays attached from the active path.",
      meta:
        [
          handoff.bundleStatus ? `bundle=${handoff.bundleStatus}` : "",
          handoff.recordStatus ? `record=${handoff.recordStatus}` : "",
          Number.isFinite(handoff.auditCount) && handoff.auditCount > 0 ? `audit=${handoff.auditCount}` : "",
          Number.isFinite(handoff.evidenceRefCount) && handoff.evidenceRefCount > 0 ? `refs=${handoff.evidenceRefCount}` : ""
        ]
          .filter(Boolean)
          .join("; ") || "Bundle, record, incident, and audit context will appear here as it becomes ready."
    },
    incident: {
      id: "incident",
      title: "Incident",
      tone: incidentPackageId ? (incidentStatus === "closed" ? "ok" : "warn") : incidentId ? "warn" : "neutral",
      label: incidentPackageId
        ? incidentStatus
          ? `Incident ${incidentStatus}`
          : "Incident linked"
        : incidentId
          ? "Incident attached"
          : "No incident handoff",
      summary: incidentPackageId
        ? `Incident package ${incidentPackageId} is attached to this governed path.`
        : incidentId
          ? "Incident follow-through is already part of this governed path."
          : "Incident follow-through is not attached to this governed path.",
      meta:
        [
          incidentPackageId ? `incident=${incidentPackageId}` : "",
          incidentStatus ? `status=${incidentStatus}` : ""
        ]
          .filter(Boolean)
          .join("; ") || "Open IncidentOps only when escalation or closure follow-through is needed."
    }
  };
}

export function renderWorkbenchArrivalContext({ domainRoot = "", handoffContext = null } = {}) {
  const handoff =
    handoffContext && typeof handoffContext === "object"
      ? handoffContext
      : null;
  const normalizedDomainRoot = String(domainRoot || "").trim().toLowerCase();
  if (!handoff || !normalizedDomainRoot) {
    return "";
  }
  const targetView = String(handoff.view || "").trim().toLowerCase();
  if (targetView && targetView !== normalizedDomainRoot) {
    return "";
  }
  const spine = resolveWorkbenchArrivalSpine(handoff);
  const contextChips = [
    renderArrivalNeutralChip("run", handoff.runId),
    renderArrivalNeutralChip("approval", handoff.approvalId),
    renderArrivalNeutralChip("incident", handoff.incidentPackageId || handoff.incidentId)
  ]
    .filter(Boolean)
    .join("");
  return `
    <section class="workbench-arrival-context" data-workbench-arrival-context data-workbench-arrival-domain="${escapeHTML(normalizedDomainRoot)}">
      <article class="metric workbench-arrival-context-card">
        <div class="workbench-arrival-context-header">
          <div class="workbench-arrival-context-copy">
            <div class="title">Continue governed work</div>
            <div class="meta">Companion handoff context.</div>
            <div class="meta">Finish the same governed item here when daily review needs deeper follow-through.</div>
            <div class="meta">${escapeHTML(
              String(handoff.arrivalRationale || "Companion opened this workspace because the governed item needs deeper review.")
            )}</div>
            <div class="meta">Decision / Receipt / Proof / Incident stays attached below when you need continuity detail.</div>
          </div>
          <div class="workbench-arrival-context-chip-row">
            <span class="native-launcher-status-badge">Deeper review</span>
            ${contextChips}
          </div>
        </div>
        <div class="workbench-arrival-context-grid">
          ${renderArrivalSpineAnchor(spine?.decision, "decision")}
          ${renderArrivalSpineAnchor(spine?.receipt, "receipt")}
          ${renderArrivalSpineAnchor(spine?.proof, "proof")}
          ${renderArrivalSpineAnchor(spine?.incident, "incident")}
        </div>
      </article>
    </section>
  `;
}

export function renderWorkbenchDomainCluster({
  title = "",
  lead = "",
  body = "",
  span = "",
  bodyClass = ""
} = {}) {
  const normalizedBody = String(body || "").trim();
  const normalizedSpan = String(span || "").trim();
  return `
    <section class="workbench-domain-cluster"${normalizedSpan ? ` data-workbench-cluster-span="${escapeHTML(normalizedSpan)}"` : ""}>
      <div class="workbench-domain-cluster-header">
        ${title ? `<h3 class="workbench-domain-cluster-title">${escapeHTML(String(title))}</h3>` : ""}
        ${lead ? `<p class="workbench-domain-cluster-lead">${escapeHTML(String(lead))}</p>` : ""}
      </div>
      <div class="${joinClasses("workbench-domain-cluster-body", bodyClass)}">${normalizedBody}</div>
    </section>
  `;
}

export function renderWorkbenchDomainShell({
  domainRoot = "",
  shellClass = "",
  title = "",
  lead = "",
  layout = "",
  prelude = "",
  clusters = []
} = {}) {
  const normalizedPrelude = String(prelude || "").trim();
  const clusterMarkup = (Array.isArray(clusters) ? clusters : [])
    .map((cluster) => String(cluster || "").trim())
    .filter(Boolean)
    .join("");
  const normalizedLayout = String(layout || "").trim();
  return `
    <div class="${joinClasses("workbench-domain-shell", shellClass)}"${domainRoot ? ` data-domain-root="${escapeHTML(domainRoot)}"` : ""}>
      <div class="workbench-domain-shell-header">
        ${title ? `<h2>${escapeHTML(String(title))}</h2>` : ""}
        ${lead ? `<p class="workbench-domain-shell-lead">${escapeHTML(String(lead))}</p>` : ""}
      </div>
      ${normalizedPrelude}
      <div class="workbench-domain-cluster-grid"${normalizedLayout ? ` data-workbench-cluster-layout="${escapeHTML(normalizedLayout)}"` : ""}>
        ${clusterMarkup}
      </div>
    </div>
  `;
}

export function renderWorkbenchDomainEmptyState({
  domainRoot = "",
  shellClass = "",
  title = "",
  lead = "",
  content = ""
} = {}) {
  return renderWorkbenchDomainShell({
    domainRoot,
    shellClass,
    title,
    lead,
    clusters: [
      `
        <div class="workbench-domain-empty-state">
          ${String(content || "").trim()}
        </div>
      `
    ]
  });
}
