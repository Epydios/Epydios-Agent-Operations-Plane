import { chipClassForStatus, escapeHTML, renderPanelStateMetric } from "../../../../views/common.js";

function buildHealthBlocks(health, pipeline) {
  return [
    { title: "Runtime", status: health.runtime?.status, detail: health.runtime?.detail },
    { title: "Providers", status: health.providers?.status, detail: health.providers?.detail },
    { title: "Policy", status: health.policy?.status, detail: health.policy?.detail },
    {
      title: "Pipeline",
      status: pipeline?.status,
      detail:
        pipeline?.detail ||
        `staging=${pipeline?.latestStagingGate || "-"}; prod=${pipeline?.latestProdGate || "-"}`
    }
  ];
}

export function renderRuntimeHealthCards(container, health, pipeline) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const blocks = buildHealthBlocks(health || {}, pipeline || {});
  container.dataset.domainRoot = "runtimeops";
  container.dataset.runtimeopsPanel = "health";
  container.innerHTML = blocks
    .map(
      (block) => `
        <div class="metric runtimeops-health-card" data-domain-root="runtimeops" data-runtimeops-panel="health-card">
          <div class="title">${escapeHTML(block.title)}</div>
          <div class="meta"><span class="${chipClassForStatus(block.status)}">${escapeHTML(String(block.status || "unknown").toUpperCase())}</span></div>
          <div class="meta">${escapeHTML(block.detail || "-")}</div>
        </div>
      `
    )
    .join("");
}

export function renderRuntimeHealth(ui, health, pipeline) {
  renderRuntimeHealthCards(ui.healthContent, health, pipeline);
}

export function renderRuntimeHealthError(container, message) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  container.dataset.domainRoot = "runtimeops";
  container.dataset.runtimeopsPanel = "health";
  container.innerHTML = `
    <div data-domain-root="runtimeops" data-runtimeops-panel="health-error">
      ${renderPanelStateMetric(
        "error",
        "Platform Health",
        message || "Unable to load health data.",
        "Retry refresh. If the error persists, verify runtime, provider, and pipeline inputs before continuing."
      )}
    </div>
  `;
}

export function renderRuntimeError(ui, message) {
  renderRuntimeHealthError(ui.healthContent, message);
}
