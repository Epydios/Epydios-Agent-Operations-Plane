import { chipClassForStatus, escapeHTML, renderPanelStateMetric } from "./common.js";

export function renderHealth(ui, health, pipeline) {
  ui.healthContent.innerHTML = "";

  const blocks = [
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

  for (const block of blocks) {
    const el = document.createElement("div");
    el.className = "metric";
    el.innerHTML = `
      <div class="title">${escapeHTML(block.title)}</div>
      <div class="meta"><span class="${chipClassForStatus(block.status)}">${escapeHTML(String(block.status || "unknown").toUpperCase())}</span></div>
      <div class="meta">${escapeHTML(block.detail || "-")}</div>
    `;
    ui.healthContent.appendChild(el);
  }
}

export function renderError(ui, message) {
  ui.healthContent.innerHTML = renderPanelStateMetric(
    "error",
    "Platform Health",
    message || "Unable to load health data.",
    "Retry refresh. If the error persists, verify runtime, provider, and pipeline inputs before continuing."
  );
}
