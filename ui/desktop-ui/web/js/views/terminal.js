import { escapeHTML } from "./common.js";

function simpleCommandTag(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const normalized = (hash >>> 0).toString(16).padStart(8, "0");
  return `cmd-${normalized}`;
}

export function readTerminalInput(ui) {
  const parsedTimeout = Number.parseInt(String(ui.terminalTimeoutSeconds?.value || ""), 10);
  return {
    runId: String(ui.terminalRunId?.value || "").trim(),
    command: String(ui.terminalCommand?.value || "").trim(),
    cwd: String(ui.terminalCwd?.value || "").trim() || "/workspace",
    timeoutSeconds: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 60,
    readOnlyRequested: Boolean(ui.terminalReadOnly?.checked),
    restrictedHostRequest: Boolean(ui.terminalRestrictedHostRequest?.checked)
  };
}

export function applyTerminalInput(ui, input) {
  const next = input || {};
  if (ui.terminalRunId) {
    ui.terminalRunId.value = String(next.runId || "").trim();
  }
  if (ui.terminalCommand) {
    ui.terminalCommand.value = String(next.command || "").trim();
  }
  if (ui.terminalCwd) {
    ui.terminalCwd.value = String(next.cwd || "").trim() || "/workspace";
  }
  if (ui.terminalTimeoutSeconds) {
    ui.terminalTimeoutSeconds.value = Number.isFinite(next.timeoutSeconds) && next.timeoutSeconds > 0 ? String(next.timeoutSeconds) : "60";
  }
  if (ui.terminalReadOnly) {
    ui.terminalReadOnly.checked = Boolean(next.readOnlyRequested);
  }
  if (ui.terminalRestrictedHostRequest) {
    ui.terminalRestrictedHostRequest.checked = Boolean(next.restrictedHostRequest);
  }
}

export function evaluateTerminalIssues(input, choices) {
  const issues = [];

  if (!input.runId) {
    issues.push({ severity: "error", message: "Run ID is required for terminal session scope." });
  }
  if (!input.command) {
    issues.push({ severity: "error", message: "Command text is required." });
  }

  const terminalMode = String(choices?.terminal?.mode || "").trim().toLowerCase();
  const restrictedHostMode = String(choices?.terminal?.restrictedHostMode || "").trim().toLowerCase();
  if (terminalMode === "read_only" && !input.readOnlyRequested) {
    issues.push({
      severity: "error",
      message: "Terminal mode is read_only; interactive execution cannot be requested."
    });
  }

  if (input.restrictedHostRequest && restrictedHostMode === "blocked") {
    issues.push({
      severity: "error",
      message: "restricted_host terminal requests are blocked by current policy defaults."
    });
  }

  if (terminalMode === "interactive_sandbox_only" && input.restrictedHostRequest) {
    issues.push({
      severity: "warn",
      message: "interactive_sandbox_only is active; restricted-host requests should remain disabled."
    });
  }

  return issues;
}

export function readTerminalHistoryFilters(ui) {
  return {
    runId: String(ui.terminalHistoryRunFilter?.value || "").trim().toLowerCase(),
    status: String(ui.terminalHistoryStatusFilter?.value || "").trim().toUpperCase()
  };
}

export function buildTerminalRequest(input, session, choices, selectedAgentProfileId) {
  const claims = session?.claims || {};
  const tenantId = String(claims.tenant_id || "").trim();
  const projectId = String(claims.project_id || "").trim();
  const actor = String(claims.sub || "").trim() || "anonymous-operator";
  const requestId = `term-${Date.now()}`;
  const commandTag = simpleCommandTag(input.command);

  return {
    meta: {
      requestId,
      tenantId,
      projectId,
      actor: {
        type: "operator_ui",
        id: actor
      }
    },
    scope: {
      runId: input.runId,
      tenantId,
      projectId,
      environment: "staging"
    },
    command: {
      text: input.command,
      cwd: input.cwd,
      timeoutSeconds: input.timeoutSeconds,
      readOnlyRequested: input.readOnlyRequested
    },
    safety: {
      terminalMode: String(choices?.terminal?.mode || "interactive_sandbox_only"),
      restrictedHostMode: String(choices?.terminal?.restrictedHostMode || "blocked"),
      restrictedHostRequest: input.restrictedHostRequest
    },
    provenance: {
      source: "epydios-agentops-desktop-ui",
      commandTag,
      agentProfileId: String(selectedAgentProfileId || "").trim().toLowerCase() || "codex"
    },
    auditLink: {
      event: "runtime.terminal.command",
      runId: input.runId,
      providerId: "terminal-session"
    }
  };
}

export function renderTerminalPolicyHints(ui, choices, issues) {
  if (!ui.terminalPolicyHints) {
    return;
  }

  const terminalMode = String(choices?.terminal?.mode || "-");
  const restrictedHostMode = String(choices?.terminal?.restrictedHostMode || "-");
  const issueRows =
    issues.length === 0
      ? '<div class="metric"><div class="meta">No blocking terminal policy issues detected.</div></div>'
      : issues
          .map((issue) => {
            const level = issue.severity === "error" ? "ERROR" : "WARN";
            return `
              <div class="metric">
                <div class="title">${escapeHTML(level)}</div>
                <div class="meta">${escapeHTML(issue.message)}</div>
              </div>
            `;
          })
          .join("");

  ui.terminalPolicyHints.innerHTML = `
    <div class="metric">
      <div class="meta">terminalMode=${escapeHTML(terminalMode)}</div>
      <div class="meta">restrictedHostMode=${escapeHTML(restrictedHostMode)}</div>
      <div class="meta">Every command is tagged with provenance and linked to audit filters by run.</div>
    </div>
    ${issueRows}
  `;
}

export function renderTerminalPayload(ui, payload) {
  if (!ui.terminalPayload) {
    return;
  }
  ui.terminalPayload.textContent = JSON.stringify(payload || {}, null, 2);
}

export function renderTerminalFeedback(ui, tone, message, result = null) {
  if (!ui.terminalFeedback) {
    return;
  }

  const title =
    tone === "error"
      ? "Terminal Request Failed"
      : tone === "ok"
        ? "Terminal Request Submitted"
        : "Terminal Control";
  const sessionId = result?.sessionId ? `sessionId=${result.sessionId}` : "sessionId=-";
  const status = result?.status ? `status=${result.status}` : "status=-";
  const commandTag = result?.provenanceTag ? `commandTag=${result.provenanceTag}` : "commandTag=-";
  const exitCode =
    Number.isFinite(result?.result?.exitCode) && result?.result?.exitCode >= -1
      ? `exitCode=${result.result.exitCode}`
      : "exitCode=-";
  const outputHash = result?.result?.outputSha256
    ? `outputSha256=${result.result.outputSha256}`
    : "outputSha256=-";
  const timedOut = result?.result?.timedOut ? "timedOut=true" : "timedOut=false";
  const truncated = result?.result?.truncated ? "truncated=true" : "truncated=false";
  const outputPreview = String(result?.result?.output || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 180);
  const outputLine = outputPreview ? `output="${outputPreview}"` : "";

  ui.terminalFeedback.innerHTML = `
    <div class="metric">
      <div class="title">${escapeHTML(title)}</div>
      <div class="meta">${escapeHTML(message || "")}</div>
      <div class="meta">${escapeHTML(sessionId)}; ${escapeHTML(status)}; ${escapeHTML(commandTag)}</div>
      <div class="meta">${escapeHTML(exitCode)}; ${escapeHTML(outputHash)}; ${escapeHTML(timedOut)}; ${escapeHTML(truncated)}</div>
      ${outputLine ? `<div class="meta">${escapeHTML(outputLine)}</div>` : ""}
    </div>
  `;
}

function filterTerminalHistory(items, filters) {
  const runFilter = String(filters?.runId || "").trim().toLowerCase();
  const statusFilter = String(filters?.status || "").trim().toUpperCase();
  return (items || []).filter((entry) => {
    const runId = String(entry?.input?.runId || "").trim().toLowerCase();
    const status = String(entry?.result?.status || "").trim().toUpperCase();
    if (runFilter && !runId.includes(runFilter)) {
      return false;
    }
    if (statusFilter && status !== statusFilter) {
      return false;
    }
    return true;
  });
}

export function renderTerminalHistory(ui, items, filters) {
  if (!ui.terminalHistory) {
    return;
  }

  const allItems = Array.isArray(items) ? items : [];
  if (allItems.length === 0) {
    ui.terminalHistory.innerHTML = `
      <div class="metric">
        <div class="meta">No terminal requests have been submitted in this session.</div>
      </div>
    `;
    return;
  }
  const history = filterTerminalHistory(allItems, filters);
  if (history.length === 0) {
    ui.terminalHistory.innerHTML = `
      <div class="metric">
        <div class="meta">No terminal history rows match current filters.</div>
      </div>
    `;
    return;
  }

  ui.terminalHistory.innerHTML = history
    .map((entry) => {
      const id = String(entry?.id || "").trim();
      const createdAt = String(entry?.createdAt || "").trim() || "-";
      const runId = String(entry?.input?.runId || "").trim() || "-";
      const command = String(entry?.input?.command || "").trim() || "-";
      const status = String(entry?.result?.status || "").trim() || String(entry?.tone || "").trim().toUpperCase() || "-";
      const sessionId = String(entry?.result?.sessionId || "").trim() || "-";
      const exitCode = Number.isFinite(entry?.result?.result?.exitCode) ? String(entry.result.result.exitCode) : "-";
      const outputHash = String(entry?.result?.result?.outputSha256 || "").trim() || "-";
      const message = String(entry?.message || "").trim();
      return `
        <div class="metric">
          <div class="title">${escapeHTML(command)}</div>
          <div class="meta">runId=${escapeHTML(runId)}; createdAt=${escapeHTML(createdAt)}; status=${escapeHTML(status)}; sessionId=${escapeHTML(sessionId)}</div>
          <div class="meta">exitCode=${escapeHTML(exitCode)}; outputSha256=${escapeHTML(outputHash)}</div>
          ${message ? `<div class="meta">${escapeHTML(message)}</div>` : ""}
          <div class="approval-actions">
            <button class="btn btn-secondary btn-small" type="button" data-terminal-history-rerun-id="${escapeHTML(id)}">Rerun</button>
          </div>
        </div>
      `;
    })
    .join("");
}
