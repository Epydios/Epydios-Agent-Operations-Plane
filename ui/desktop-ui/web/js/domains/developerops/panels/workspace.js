import { escapeHTML } from "../../../views/common.js";
import { createDeveloperWorkspaceSnapshot } from "../state.js";

function chipClassForTone(value) {
  const tone = String(value || "").trim().toLowerCase();
  if (tone === "ok") {
    return "chip chip-ok chip-compact";
  }
  if (tone === "warn" || tone === "error") {
    return "chip chip-warn chip-compact";
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
        <span class="developerops-value-pill">
          <span class="developerops-value-key">${escapeHTML(label)}</span>
          <span class="developerops-value-text${item?.code ? " developerops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="developerops-empty">not available</span>';
  }
  return `<div class="developerops-value-group">${values.join("")}</div>`;
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
        <div class="developerops-row">
          <div class="developerops-row-label">${escapeHTML(label)}</div>
          <div class="developerops-row-value">${value || '<span class="developerops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderPayloadPreview(board) {
  return `
    <section class="developerops-preview-card">
      <div class="developerops-preview-header">
        <div class="developerops-preview-title">${escapeHTML(board.title)}</div>
        <span class="${chipClassForTone(board.tone)}">issues=${escapeHTML(String(board.issueCount))}</span>
      </div>
      <div class="developerops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Summary",
            value: renderValuePills(board.summaryItems)
          },
          {
            label: "Payload Preview",
            value: board.preview
              ? `<pre class="developerops-payload-preview"><code>${escapeHTML(board.preview)}</code></pre>`
              : '<span class="developerops-empty">not available</span>'
          }
        ])}
      </div>
    </section>
  `;
}

function renderDebugToolsBoard(snapshot) {
  const board = snapshot.debugTools;
  return `
    <article class="metric developerops-card" data-domain-root="developerops" data-developerops-panel="debug-tools">
      <div class="metric-title-row">
        <div class="title">Debug Tools Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="developerops-chip-row">
        <span class="chip chip-neutral chip-compact">advanced=${escapeHTML(board.advancedVisible ? "visible" : "hidden")}</span>
        <span class="chip chip-neutral chip-compact">project=${escapeHTML(board.projectScope)}</span>
        <span class="chip chip-neutral chip-compact">runs=${escapeHTML(String(board.runCount))}</span>
        <span class="chip chip-neutral chip-compact">terminal history=${escapeHTML(String(board.terminalHistoryCount))}</span>
      </div>
      <div class="developerops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Workspace Debug Context",
            value: renderValuePills([
              { label: "actor", value: board.actor, code: true },
              { label: "agent profile", value: board.selectedAgentProfileId, code: true },
              { label: "tool issues", value: String(board.toolIssueCount) }
            ])
          },
          {
            label: "Health Signals",
            value: renderValuePills([
              { label: "runtime", value: board.runtimeStatus, code: true },
              { label: "providers", value: board.providersStatus, code: true },
              { label: "policy", value: board.policyStatus, code: true }
            ])
          },
          {
            label: "Tool Inventory",
            value: renderValuePills([
              { label: "ready providers", value: `${board.providerReadyCount}/${board.providerTotalCount}` },
              { label: "governed action", value: "available" },
              { label: "run builder", value: "available" },
              { label: "terminal", value: "available" }
            ])
          }
        ])}
      </div>
    </article>
  `;
}

function renderRawPayloadBoard(snapshot) {
  const board = snapshot.rawPayload;
  const cards = [
    {
      title: "Governed Action Preview",
      tone: board.governedAction.tone,
      issueCount: board.governedAction.issueCount,
      summaryItems: [
        { label: "request", value: board.governedAction.requestId, code: true },
        { label: "target", value: board.governedAction.target, code: true },
        { label: "risk", value: board.governedAction.riskTier, code: true },
        { label: "label", value: board.governedAction.requestLabel }
      ],
      preview: board.governedAction.preview
    },
    {
      title: "Run Builder Preview",
      tone: board.runBuilder.tone,
      issueCount: board.runBuilder.issueCount,
      summaryItems: [
        { label: "request", value: board.runBuilder.requestId, code: true },
        { label: "tier", value: board.runBuilder.tier, code: true },
        { label: "profile", value: board.runBuilder.targetExecutionProfile, code: true },
        { label: "capabilities", value: String(board.runBuilder.capabilityCount) }
      ],
      preview: board.runBuilder.preview
    },
    {
      title: "Terminal Preview",
      tone: board.terminal.tone,
      issueCount: board.terminal.issueCount,
      summaryItems: [
        { label: "request", value: board.terminal.requestId, code: true },
        { label: "run", value: board.terminal.runId, code: true },
        { label: "command", value: board.terminal.commandTag, code: true },
        { label: "mode", value: board.terminal.terminalMode, code: true }
      ],
      preview: board.terminal.preview
    }
  ];
  return `
    <article class="metric developerops-card" data-domain-root="developerops" data-developerops-panel="raw-payload">
      <div class="metric-title-row">
        <div class="title">Raw Payload Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="developerops-preview-grid">
        ${cards.map((card) => renderPayloadPreview(card)).join("")}
      </div>
    </article>
  `;
}

function renderContractLab(snapshot) {
  const board = snapshot.contractLab;
  return `
    <article class="metric developerops-card" data-domain-root="developerops" data-developerops-panel="contract-lab">
      <div class="metric-title-row">
        <div class="title">Contract Lab</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="developerops-chip-row">
        <span class="chip chip-neutral chip-compact">policy packs=${escapeHTML(String(board.policyPackCount))}</span>
        <span class="chip chip-neutral chip-compact">contracts=${escapeHTML(String(board.providerContractCount))}</span>
        <span class="chip chip-neutral chip-compact">permissions=${escapeHTML(String(board.effectivePermissionCount))}</span>
      </div>
      <div class="developerops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Identity Contract",
            value: renderValuePills([
              { label: "authority", value: board.authorityBasis, code: true },
              { label: "source", value: board.identitySource, code: true },
              { label: "profile", value: board.selectedAgentProfileId, code: true }
            ])
          },
          {
            label: "Provider Contract",
            value: renderValuePills([
              { label: "provider", value: board.selectedProvider, code: true },
              { label: "transport", value: board.selectedTransport, code: true },
              { label: "endpoint", value: board.selectedEndpointRef, code: true }
            ])
          },
          {
            label: "Provider Route And Terminal",
            value: renderValuePills([
              { label: "aimxs mode", value: board.aimxsMode, code: true },
              { label: "aimxs provider", value: board.aimxsProviderId, code: true },
              { label: "terminal mode", value: board.terminalMode, code: true },
              { label: "restricted host", value: board.restrictedHostMode, code: true }
            ])
          }
        ])}
      </div>
    </article>
  `;
}

export function renderDeveloperWorkspace(context = {}) {
  const snapshot = createDeveloperWorkspaceSnapshot(context);
  return `
    <div class="stack" data-domain-root="developerops">
      <div class="developerops-grid">
        ${renderDebugToolsBoard(snapshot)}
        ${renderRawPayloadBoard(snapshot)}
        ${renderContractLab(snapshot)}
      </div>
    </div>
  `;
}
