import { escapeHTML } from "./common.js";

function metric(title, value, detail) {
  return `
    <div class="metric">
      <div class="title">${escapeHTML(title)}</div>
      <div class="meta">${escapeHTML(value)}</div>
      <div class="meta">${escapeHTML(detail)}</div>
    </div>
  `;
}

export function renderExecutionDefaults(ui, choices) {
  if (!ui.executionDefaultsContent) {
    return;
  }

  const blocks = [
    metric(
      "Realtime Transport",
      choices.realtime.mode,
      choices.realtime.mode === "polling"
        ? `poll interval=${choices.realtime.pollIntervalMs}ms`
        : "server push (SSE)"
    ),
    metric(
      "Terminal Mode",
      choices.terminal.mode,
      `restricted_host=${choices.terminal.restrictedHostMode}`
    ),
    metric(
      "Integration Routing",
      choices.integrations.modelRouting,
      `gateway=${choices.integrations.gatewayProviderId}; direct_fallback=${choices.integrations.allowDirectProviderFallback}`
    )
  ];

  ui.executionDefaultsContent.innerHTML = blocks.join("");
}
