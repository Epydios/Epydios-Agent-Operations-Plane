import { chipClassForStatus, escapeHTML } from "../../../views/common.js";

function renderFeedback(feedback = null) {
  if (!feedback?.message) {
    return "";
  }
  return `<div class="logops-feedback ${escapeHTML(feedback.tone || "info")}">${escapeHTML(
    feedback.message
  )}</div>`;
}

function renderSummaryCard(title, value, tone, detail) {
  return `
    <article class="metric logops-summary-card">
      <div class="title">${escapeHTML(title)}</div>
      <div class="meta">
        <span class="${chipClassForStatus(tone)} chip-compact">${escapeHTML(tone)}</span>
      </div>
      <div class="logops-summary-value">${escapeHTML(value)}</div>
      <div class="meta">${escapeHTML(detail)}</div>
    </article>
  `;
}

function renderPathRow(entry = {}) {
  return `
    <tr data-logops-entry-id="${escapeHTML(entry.id || "")}">
      <td data-label="Artifact">
        <div class="title">${escapeHTML(entry.title || "Log")}</div>
        <div class="meta">${escapeHTML(entry.purpose || "-")}</div>
      </td>
      <td data-label="Path">
        <code>${escapeHTML(entry.path || "-")}</code>
      </td>
      <td data-label="Action" class="logops-action-cell">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-logops-action="open-path"
          data-logops-path="${escapeHTML(entry.path || "")}"
          data-logops-label="${escapeHTML(entry.title || "Artifact")}"
          ${entry.path ? "" : "disabled"}
        >Open</button>
      </td>
    </tr>
  `;
}

export function renderLogOpsWorkspace(snapshot = {}) {
  const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
  const startupError = String(snapshot.startupError || "").trim();
  return `
    <div class="logops-workspace" data-domain-root="logops">
      <section class="logops-board">
        <div class="logops-board-header">
          <h3 data-focus-anchor>Native Logs And Session Artifacts</h3>
          <p class="logops-board-lead">Keep the global launcher strip compact. Use LogOps for the few file paths that actually matter when something needs inspection.</p>
        </div>
        ${renderFeedback(snapshot.feedback)}
        ${
          startupError
            ? `<div class="logops-startup-error"><strong>Startup error:</strong> ${escapeHTML(startupError)}</div>`
            : ""
        }
        <div class="logops-summary-grid">
          ${renderSummaryCard("Mode", snapshot.mode || "-", snapshot.mode === "live" ? "ready" : "warn", "Native launcher mode")}
          ${renderSummaryCard("Launcher", snapshot.launcherState || "-", snapshot.launcherState || "unknown", "Current launcher posture")}
          ${renderSummaryCard("Runtime Service", snapshot.runtimeServiceState || "-", snapshot.runtimeServiceState || "unknown", `runtime=${snapshot.runtimeState || "-"}`)}
          ${renderSummaryCard("Gateway", snapshot.gatewayServiceState || "-", snapshot.gatewayServiceState || "unknown", "Localhost gateway posture")}
        </div>
      </section>
      <section class="logops-board">
        <div class="logops-board-header">
          <h3>Relevant Paths</h3>
          <p class="logops-board-lead">These are the logs and session artifacts worth opening from the installed app. The rest of the native support roots stay out of the way.</p>
        </div>
        ${
          entries.length
            ? `
              <div class="logops-table-shell">
                <table class="data-table logops-table">
                  <thead>
                    <tr>
                      <th scope="col">Artifact</th>
                      <th scope="col">Path</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${entries.map((entry) => renderPathRow(entry)).join("")}
                  </tbody>
                </table>
              </div>
            `
            : `<div class="logops-empty">No native log artifacts are available in this shell yet.</div>`
        }
      </section>
    </div>
  `;
}
