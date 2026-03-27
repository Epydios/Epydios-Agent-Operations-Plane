import { escapeHTML } from "../../views/common.js";

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
