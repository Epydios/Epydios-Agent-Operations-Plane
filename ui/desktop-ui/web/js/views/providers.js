import { chipClassForStatus, escapeHTML, renderPanelStateMetric } from "./common.js";

function tableCell(label, content, attrs = "") {
  return `<td data-label="${escapeHTML(label)}"${attrs}>${content}</td>`;
}

export function renderProviders(ui, providerPayload) {
  const items = providerPayload?.items || [];
  if (items.length === 0) {
    ui.providersContent.innerHTML = renderPanelStateMetric(
      "empty",
      "Extension Providers",
      "No providers returned for the current scope.",
      "Refresh the workspace or widen scope. If providers should exist, verify contract discovery and endpoint health."
    );
    return;
  }

  const rows = items
    .map((item) => {
      const stateLabel = item.ready && item.probed ? "READY" : "ERROR";
      return `
        <tr>
          ${tableCell("Provider ID", escapeHTML(item.providerId || "-"), ' class="provider-cell-id"')}
          ${tableCell("Type", escapeHTML(item.providerType || "-"), ' class="provider-cell-type"')}
          ${tableCell("Status", `<span class="${chipClassForStatus(stateLabel)}">${stateLabel}</span>`, ' class="provider-cell-status"')}
          ${tableCell("Message", escapeHTML(item.message || "-"), ' class="provider-cell-message"')}
          ${tableCell("Endpoint", escapeHTML(item.endpoint || "-"), ' class="provider-cell-endpoint"')}
        </tr>
      `;
    })
    .join("");

  ui.providersContent.innerHTML = `
    <table class="data-table providers-table">
      <caption class="sr-only">Provider contract inventory for the current settings scope, including provider identity, type, readiness, message, and endpoint.</caption>
      <thead>
        <tr>
          <th scope="col">Provider ID</th>
          <th scope="col">Type</th>
          <th scope="col">Status</th>
          <th scope="col">Message</th>
          <th scope="col">Endpoint</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
