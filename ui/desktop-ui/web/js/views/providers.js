import { chipClassForStatus, escapeHTML } from "./common.js";

export function renderProviders(ui, providerPayload) {
  const items = providerPayload?.items || [];
  if (items.length === 0) {
    ui.providersContent.innerHTML = '<div class="metric"><div class="meta">No providers returned.</div></div>';
    return;
  }

  const rows = items
    .map((item) => {
      const stateLabel = item.ready && item.probed ? "READY" : "ERROR";
      return `
        <tr>
          <td>${escapeHTML(item.providerId || "-")}</td>
          <td>${escapeHTML(item.providerType || "-")}</td>
          <td><span class="${chipClassForStatus(stateLabel)}">${stateLabel}</span></td>
          <td>${escapeHTML(item.message || "-")}</td>
          <td>${escapeHTML(item.endpoint || "-")}</td>
        </tr>
      `;
    })
    .join("");

  ui.providersContent.innerHTML = `
    <table class="providers-table">
      <thead>
        <tr>
          <th>Provider ID</th>
          <th>Type</th>
          <th>Status</th>
          <th>Message</th>
          <th>Endpoint</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
