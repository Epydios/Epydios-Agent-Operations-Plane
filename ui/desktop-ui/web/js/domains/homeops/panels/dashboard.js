import { escapeHTML } from "../../../views/common.js";
import { summarizeHomeOpsTriage } from "../state.js";

export function renderHomeOpsTriage(target, snapshot) {
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const triage = summarizeHomeOpsTriage(snapshot);
  const approvalTone =
    triage.pendingApprovals > 0 ? "chip chip-danger chip-compact" : "chip chip-ok chip-compact";
  const runsTone =
    triage.attentionRuns > 0 ? "chip chip-danger chip-compact" : "chip chip-ok chip-compact";
  const auditTone =
    triage.denyAuditEvents > 0 ? "chip chip-warn chip-compact" : "chip chip-ok chip-compact";
  const terminalIssueCount = triage.terminalPolicyBlocked + triage.terminalFailed;
  const terminalTone =
    terminalIssueCount > 0 ? "chip chip-warn chip-compact" : "chip chip-ok chip-compact";

  target.innerHTML = `
    <article class="triage-card">
      <div class="title">Pending Approvals</div>
      <div class="triage-value">${escapeHTML(String(triage.pendingApprovals))}</div>
      <div class="meta"><span class="${approvalTone}">expiring <=5m: ${escapeHTML(String(triage.expiringSoonApprovals))}</span></div>
      <div class="triage-actions">
        <button class="btn btn-secondary btn-small" type="button" data-triage-action="open-approvals-pending">Open Approval Queue</button>
      </div>
    </article>
    <article class="triage-card">
      <div class="title">Runs Requiring Attention</div>
      <div class="triage-value">${escapeHTML(String(triage.attentionRuns))}</div>
      <div class="meta"><span class="${runsTone}">latest=${escapeHTML(triage.latestAttentionRunId || "-")}</span></div>
      <div class="triage-actions">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-triage-action="open-runs-attention"
          data-triage-run-id="${escapeHTML(triage.latestAttentionRunId || "")}"
        >Open Run List</button>
      </div>
    </article>
    <article class="triage-card">
      <div class="title">Audit Denies</div>
      <div class="triage-value">${escapeHTML(String(triage.denyAuditEvents))}</div>
      <div class="meta"><span class="${auditTone}">current audit scope</span></div>
      <div class="triage-actions">
        <button class="btn btn-secondary btn-small" type="button" data-triage-action="open-audit-deny">Filter Deny Events</button>
      </div>
    </article>
    <article class="triage-card">
      <div class="title">Terminal Issues</div>
      <div class="triage-value">${escapeHTML(String(terminalIssueCount))}</div>
      <div class="meta"><span class="${terminalTone}">policy_blocked=${escapeHTML(String(triage.terminalPolicyBlocked))}; failed=${escapeHTML(String(triage.terminalFailed))}</span></div>
      <div class="triage-actions">
        <button class="btn btn-secondary btn-small" type="button" data-triage-action="open-terminal-issues">Open Terminal History</button>
      </div>
    </article>
  `;
}
