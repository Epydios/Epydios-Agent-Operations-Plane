const vscode = require("vscode");
const { AgentOpsRuntimeClient, RuntimeClientError } = require("./lib/runtimeClient");
const {
  buildThreadReviewModel,
  formatThreadSubtitle,
  isTerminalStatus,
  latestKnownSequence
} = require("./lib/sessionReview");
const {
  buildDecisionActionHints,
  resolveApprovalDecisionTarget,
  resolveProposalDecisionTarget
} = require("./lib/threadContext");
const { buildGovernedUpdateEnvelope } = require("./lib/updateEnvelope");

function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function clipText(value, maxLength = 140) {
  const text = normalizedString(value);
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

function sessionSortDescending(a, b) {
  return new Date(b?.updatedAt || b?.createdAt || 0).getTime() - new Date(a?.updatedAt || a?.createdAt || 0).getTime();
}

function statusIcon(status) {
  switch (normalizedString(status).toUpperCase()) {
    case "COMPLETED":
      return new vscode.ThemeIcon("pass-filled");
    case "FAILED":
    case "BLOCKED":
    case "CANCELLED":
      return new vscode.ThemeIcon("error");
    case "RUNNING":
    case "IN_PROGRESS":
      return new vscode.ThemeIcon("loading~spin");
    case "READY":
    case "AWAITING_WORKER":
    case "AWAITING_APPROVAL":
      return new vscode.ThemeIcon("clock");
    default:
      return new vscode.ThemeIcon("comment-discussion");
  }
}

class ThreadItem extends vscode.TreeItem {
  constructor(task, sessions = []) {
    super(normalizedString(task?.title, normalizedString(task?.taskId, "Thread")), vscode.TreeItemCollapsibleState.None);
    const latestSession = Array.isArray(sessions) ? [...sessions].sort(sessionSortDescending)[0] || null : null;
    this.task = task;
    this.sessions = sessions;
    this.contextValue = "agentopsThread";
    this.description = formatThreadSubtitle(task, latestSession);
    this.tooltip = new vscode.MarkdownString([
      `**Task**: ${normalizedString(task?.taskId, "-")}`,
      `**Status**: ${normalizedString(task?.status, "-")}`,
      latestSession ? `**Latest Session**: ${normalizedString(latestSession?.sessionId, "-")}` : "**Latest Session**: -",
      normalizedString(task?.intent) ? `**Intent**: ${clipText(task.intent, 280)}` : ""
    ].filter(Boolean).join("  \n"));
    this.iconPath = statusIcon(latestSession?.status || task?.status);
    this.command = {
      command: "agentops.resumeThread",
      title: "Resume Thread Review",
      arguments: [this]
    };
  }
}

class AgentOpsThreadProvider {
  constructor(client) {
    this.client = client;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  async getChildren(element) {
    if (element) {
      return [];
    }
    try {
      const query = {
        tenantId: this.client.getTenantId(),
        projectId: this.client.getProjectId(),
        limit: 50,
        offset: 0
      };
      const taskResponse = await this.client.listTasks(query);
      const tasks = Array.isArray(taskResponse?.items) ? taskResponse.items : [];
      const items = [];
      for (const task of tasks.sort((a, b) => new Date(b?.updatedAt || 0) - new Date(a?.updatedAt || 0))) {
        const sessionResponse = await this.client.listSessions({
          tenantId: this.client.getTenantId(),
          projectId: this.client.getProjectId(),
          taskId: normalizedString(task?.taskId),
          includeLegacy: this.client.includeLegacySessions(),
          limit: 10,
          offset: 0
        });
        items.push(new ThreadItem(task, Array.isArray(sessionResponse?.items) ? sessionResponse.items : []));
      }
      if (!items.length) {
        const empty = new vscode.TreeItem("No native threads found", vscode.TreeItemCollapsibleState.None);
        empty.description = "Check tenant/project settings or runtime scope";
        empty.iconPath = new vscode.ThemeIcon("info");
        return [empty];
      }
      return items;
    } catch (error) {
      const message = error instanceof RuntimeClientError ? error.message : String(error?.message || error);
      const item = new vscode.TreeItem("Thread load failed", vscode.TreeItemCollapsibleState.None);
      item.description = clipText(message, 90);
      item.tooltip = message;
      item.iconPath = new vscode.ThemeIcon("warning");
      return [item];
    }
  }

  getTreeItem(element) {
    return element;
  }
}

class ThreadPanel {
  static panels = new Map();

  static createOrShow(context, client, threadItem) {
    const taskId = normalizedString(threadItem?.task?.taskId);
    if (!taskId) {
      return;
    }
    const existing = ThreadPanel.panels.get(taskId);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside);
      existing.load(threadItem.task, threadItem.sessions).catch((error) => existing.renderError(error));
      return existing;
    }
    const panel = vscode.window.createWebviewPanel(
      "agentopsThreadReview",
      normalizedString(threadItem?.task?.title, taskId),
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    const instance = new ThreadPanel(panel, context, client, taskId);
    ThreadPanel.panels.set(taskId, instance);
    instance.load(threadItem.task, threadItem.sessions).catch((error) => instance.renderError(error));
    return instance;
  }

  constructor(panel, context, client, taskId) {
    this.panel = panel;
    this.context = context;
    this.client = client;
    this.taskId = taskId;
    this.thread = null;
    this.selectedSessionId = "";
    this.followHandle = null;
    this.followGeneration = 0;

    this.panel.onDidDispose(() => {
      this.stopFollow();
      ThreadPanel.panels.delete(this.taskId);
    });

    this.panel.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message).catch((error) => this.renderError(error));
    });
  }

  async handleMessage(message) {
    if (message?.type === "refresh") {
      await this.refresh();
      return;
    }
    if (message?.type === "focusSession") {
      this.selectedSessionId = normalizedString(message?.sessionId);
      this.render();
      await this.startFollow();
      return;
    }
    if (message?.type === "approvalDecision") {
      await this.applyApprovalDecision(message);
      return;
    }
    if (message?.type === "proposalDecision") {
      await this.applyProposalDecision(message);
      return;
    }
    if (message?.type === "sendTurn") {
      await this.sendGovernedTurn(message);
    }
  }

  async refresh() {
    await this.load();
  }

  async load(taskHint, sessionHints) {
    const taskId = this.taskId;
    const thread = await this.client.loadThread(taskId, {
      tenantId: this.client.getTenantId(),
      projectId: this.client.getProjectId(),
      includeLegacy: this.client.includeLegacySessions(),
      taskHint,
      sessionHints
    });
    this.thread = thread;
    const sessions = Array.isArray(thread?.sessionViews) ? thread.sessionViews : [];
    const preferred = normalizedString(this.selectedSessionId);
    const fallback = normalizedString(sessions[0]?.session?.sessionId);
    this.selectedSessionId = sessions.some((item) => normalizedString(item?.session?.sessionId) === preferred) ? preferred : fallback;
    this.panel.title = normalizedString(thread?.task?.title, taskId);
    this.render();
    await this.startFollow();
  }

  selectedSessionView() {
    const sessions = Array.isArray(this.thread?.sessionViews) ? this.thread.sessionViews : [];
    const preferred = normalizedString(this.selectedSessionId);
    return sessions.find((item) => normalizedString(item?.session?.sessionId) === preferred) || sessions[0] || null;
  }

  stopFollow() {
    this.followGeneration += 1;
    if (this.followHandle) {
      clearTimeout(this.followHandle);
      this.followHandle = null;
    }
  }

  async startFollow() {
    this.stopFollow();
    const selected = this.selectedSessionView();
    const sessionId = normalizedString(selected?.session?.sessionId);
    if (!sessionId) {
      return;
    }
    const generation = this.followGeneration;
    const loop = async () => {
      if (generation !== this.followGeneration) {
        return;
      }
      const current = this.selectedSessionView();
      if (!current) {
        return;
      }
      const activity = buildThreadReviewModel(this.thread, normalizedString(current?.session?.sessionId)).selectedActivity;
      if (isTerminalStatus(activity?.sessionStatus) && isTerminalStatus(activity?.taskStatus)) {
        return;
      }
      try {
        const response = await this.client.getSessionEventStream(normalizedString(current?.session?.sessionId), {
          afterSequence: latestKnownSequence(current),
          waitSeconds: this.client.getLiveFollowWaitSeconds(),
          follow: true
        });
        const items = Array.isArray(response?.items) ? response.items : [];
        if (items.length > 0) {
          current.streamItems = Array.isArray(current.streamItems) ? current.streamItems.concat(items) : items.slice();
          current.timeline = await this.client.getSessionTimeline(normalizedString(current?.session?.sessionId));
          this.render();
        }
      } catch (_error) {
        if (generation !== this.followGeneration) {
          return;
        }
      }
      if (generation !== this.followGeneration) {
        return;
      }
      this.followHandle = setTimeout(() => {
        loop().catch((error) => this.renderError(error));
      }, 1500);
    };
    await loop();
  }

  async applyApprovalDecision(message) {
    const selected = this.selectedSessionView();
    const selectedSummary = buildThreadReviewModel(this.thread, normalizedString(selected?.session?.sessionId)).selectedSummary;
    const decision = normalizedString(message?.decision).toUpperCase() === "DENY" ? "DENY" : "APPROVE";
    const target = resolveApprovalDecisionTarget(
      selectedSummary,
      normalizedString(message?.sessionId, normalizedString(selected?.session?.sessionId)),
      normalizedString(message?.checkpointId)
    );
    await this.client.submitSessionApprovalDecision(target.sessionId, target.targetId, decision, {
      tenantId: this.client.getTenantId(),
      projectId: this.client.getProjectId(),
      reason: normalizedString(message?.reason),
      requestId: `vscode-approval-${Date.now()}`
    });
    const decisionLabel = decision === "DENY" ? "denied" : "approved";
    vscode.window.showInformationMessage(`AgentOps ${decisionLabel} approval ${target.targetId}.`);
    this.selectedSessionId = target.sessionId;
    await this.load();
  }

  async applyProposalDecision(message) {
    const selected = this.selectedSessionView();
    const selectedSummary = buildThreadReviewModel(this.thread, normalizedString(selected?.session?.sessionId)).selectedSummary;
    const decision = normalizedString(message?.decision).toUpperCase() === "DENY" ? "DENY" : "APPROVE";
    const target = resolveProposalDecisionTarget(
      selectedSummary,
      normalizedString(message?.sessionId, normalizedString(selected?.session?.sessionId)),
      normalizedString(message?.proposalId)
    );
    await this.client.submitSessionToolProposalDecision(target.sessionId, target.targetId, decision, {
      tenantId: this.client.getTenantId(),
      projectId: this.client.getProjectId(),
      reason: normalizedString(message?.reason),
      requestId: `vscode-proposal-${Date.now()}`
    });
    const decisionLabel = decision === "DENY" ? "denied" : "approved";
    vscode.window.showInformationMessage(`AgentOps ${decisionLabel} tool proposal ${target.targetId}.`);
    this.selectedSessionId = target.sessionId;
    await this.load();
  }

  async sendGovernedTurn(message) {
    const prompt = normalizedString(message?.prompt);
    if (!prompt) {
      throw new RuntimeClientError("prompt is required");
    }
    const executionMode = normalizedString(message?.executionMode, "raw_model_invoke");
    const agentProfileId = normalizedString(message?.agentProfileId, executionMode === "managed_codex_worker" ? "codex" : "openai");
    const response = await this.client.invokeAgentTurn({
      meta: {
        tenantId: this.client.getTenantId(),
        projectId: this.client.getProjectId(),
        requestId: `vscode-turn-${Date.now()}`
      },
      taskId: this.taskId,
      prompt,
      systemPrompt: normalizedString(message?.systemPrompt),
      executionMode,
      agentProfileId,
      maxOutputTokens: Number(message?.maxOutputTokens || 0) || 0
    });
    this.selectedSessionId = normalizedString(response?.sessionId, this.selectedSessionId);
    vscode.window.showInformationMessage(
      `AgentOps governed turn submitted on ${normalizedString(response?.sessionId, this.taskId)}.`
    );
    await this.load();
  }

  renderError(error) {
    const message = clipText(error instanceof RuntimeClientError ? error.message : String(error?.message || error), 600);
    this.panel.webview.html = `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px;"><h2>AgentOps thread review failed</h2><pre>${escapeHtml(message)}</pre></body></html>`;
  }

  render() {
    const model = buildThreadReviewModel(this.thread, this.selectedSessionId);
    this.panel.webview.html = renderHtml(model);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDecisionButtons(type, sessionId, item) {
  const id = normalizedString(type === "approval" ? item?.checkpointId : item?.proposalId);
  if (!id) {
    return "";
  }
  const status = normalizedString(item?.status, "PENDING").toUpperCase();
  if (status !== "PENDING") {
    const reason = normalizedString(item?.reason);
    return `<div class="decision-meta">decision=${escapeHtml(normalizedString(item?.decision, status))}${reason ? ` | ${escapeHtml(reason)}` : ""}</div>`;
  }
  return `<div class="decision-actions">
    <button type="button" data-action="${type}:approve" data-session-id="${escapeHtml(sessionId)}" data-item-id="${escapeHtml(id)}">Approve</button>
    <button type="button" data-action="${type}:deny" data-session-id="${escapeHtml(sessionId)}" data-item-id="${escapeHtml(id)}">Deny</button>
  </div>`;
}

function renderEnvelopeSection(title, items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }
  return `<div class="envelope-section"><strong>${escapeHtml(title)}</strong><ul>${items.map((item) => `<li>${escapeHtml(normalizedString(item).replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul></div>`;
}

function renderHtml(model) {
  const selectedSessionId = normalizedString(model?.selectedSession?.sessionId);
  const sessions = Array.isArray(model?.sessions) ? model.sessions : [];
  const selectedActivity = model?.selectedActivity || {};
  const selectedSummary = model?.selectedSummary || {};
  const transcript = model?.selectedTranscript || null;
  const decisionHints = buildDecisionActionHints(selectedSummary, selectedSessionId);
  const governedUpdate = buildGovernedUpdateEnvelope(model, {
    header: "AgentOps thread update",
    updateType: "review",
    details: [
      selectedSessionId ? `Selected session: ${selectedSessionId}` : "",
      selectedSummary?.selectedWorker?.adapterId ? `Worker adapter: ${normalizedString(selectedSummary?.selectedWorker?.adapterId)} (${normalizedString(selectedSummary?.selectedWorker?.workerType, "-")})` : "",
      transcript?.toolActionId ? `Managed transcript: ${normalizedString(transcript.toolActionId)}` : ""
    ],
    recent: (selectedSummary?.events || []).slice(-4).map((item) => `${normalizedString(item?.label, item?.eventType)}: ${normalizedString(item?.detail, "Event recorded.")}`),
    actionHints: decisionHints
  });
  const sessionOptions = sessions.map((item) => {
    const sessionId = normalizedString(item?.session?.sessionId);
    const selected = sessionId === selectedSessionId ? " selected" : "";
    const label = `${sessionId || "session"} | ${normalizedString(item?.session?.status, "-")}`;
    return `<option value="${escapeHtml(sessionId)}"${selected}>${escapeHtml(label)}</option>`;
  }).join("");
  const approvals = (selectedSummary?.approvals || []).map((item) => `
    <li>
      <strong>${escapeHtml(normalizedString(item?.status, "PENDING"))}</strong>
      ${escapeHtml(normalizedString(item?.reason, normalizedString(item?.scope, "Approval checkpoint")))}
      <div class="meta">checkpointId=${escapeHtml(normalizedString(item?.checkpointId, "-"))}</div>
      ${renderDecisionButtons("approval", selectedSessionId, item)}
    </li>
  `).join("") || "<li>None</li>";
  const proposals = (selectedSummary?.toolProposals || []).map((item) => `
    <li>
      <strong>${escapeHtml(normalizedString(item?.status, "PENDING"))}</strong>
      ${escapeHtml(normalizedString(item?.command, normalizedString(item?.summary, item?.proposalType || "tool proposal")))}
      <div class="meta">proposalId=${escapeHtml(normalizedString(item?.proposalId, "-"))}</div>
      ${renderDecisionButtons("proposal", selectedSessionId, item)}
    </li>
  `).join("") || "<li>None</li>";
  const evidence = (selectedSummary?.evidenceRecords || []).map((item) => `
    <li><strong>${escapeHtml(normalizedString(item?.kind, "evidence"))}</strong> ${escapeHtml(normalizedString(item?.summary, normalizedString(item?.evidenceId)))}</li>
  `).join("") || "<li>None</li>";
  const toolActions = (selectedSummary?.toolActions || []).map((item) => `
    <li><strong>${escapeHtml(normalizedString(item?.status))}</strong> ${escapeHtml(normalizedString(item?.toolType, normalizedString(item?.toolActionId)))}</li>
  `).join("") || "<li>None</li>";
  const progress = (selectedActivity?.progressItems || []).map((item) => `
    <li><strong>${escapeHtml(normalizedString(item?.label))}</strong> ${escapeHtml(normalizedString(item?.detail))}</li>
  `).join("") || "<li>No recent worker activity.</li>";
  const events = (selectedSummary?.events || []).slice(-10).map((item) => `
    <li><strong>${escapeHtml(normalizedString(item?.eventType))}</strong> ${escapeHtml(normalizedString(item?.detail, normalizedString(item?.summary, "event")))}</li>
  `).join("") || "<li>No events.</li>";
  const transcriptBlock = transcript
    ? `<details><summary>Managed worker transcript</summary><pre>${escapeHtml(transcript.pretty)}</pre></details>`
    : "";
  const governedUpdateBlock = `<section class="panel">
    <h3>${escapeHtml(governedUpdate.header)}</h3>
    <div class="meta">type=${escapeHtml(governedUpdate.updateType)} | ${escapeHtml(governedUpdate.contextLabel)}=${escapeHtml(governedUpdate.contextValue)} | ${escapeHtml(governedUpdate.subjectLabel)}=${escapeHtml(governedUpdate.subjectValue)}</div>
    <div class="chips">
      <span class="chip">task=${escapeHtml(normalizedString(governedUpdate.taskId, "-"))}</span>
      <span class="chip">taskStatus=${escapeHtml(normalizedString(governedUpdate.taskStatus, "-"))}</span>
      <span class="chip">session=${escapeHtml(normalizedString(governedUpdate.sessionId, "-"))}</span>
      <span class="chip">sessionStatus=${escapeHtml(normalizedString(governedUpdate.sessionStatus, "-"))}</span>
      <span class="chip">worker=${escapeHtml(normalizedString(governedUpdate.workerId, "-"))}</span>
      <span class="chip">workerState=${escapeHtml(normalizedString(governedUpdate.workerState, "-"))}</span>
      <span class="chip">openApprovals=${escapeHtml(String(governedUpdate.openApprovals))}</span>
      <span class="chip">pendingProposals=${escapeHtml(String(governedUpdate.pendingProposalCount))}</span>
    </div>
    <p>${escapeHtml(normalizedString(governedUpdate.summary, "Governed thread state refreshed."))}</p>
    ${renderEnvelopeSection("Details", governedUpdate.details)}
    ${renderEnvelopeSection("Recent activity", governedUpdate.recent)}
    ${renderEnvelopeSection("Action hints", governedUpdate.actionHints)}
  </section>`;
  const nonce = String(Date.now());
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(normalizedString(model?.task?.title, model?.task?.taskId || "AgentOps Thread"))}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
header { display: grid; gap: 10px; margin-bottom: 16px; }
button, select, textarea, input { font: inherit; }
button { padding: 6px 10px; }
textarea, input, select { width: 100%; box-sizing: border-box; padding: 6px 8px; }
textarea { min-height: 110px; resize: vertical; }
.panel-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.panel { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 12px; background: color-mix(in srgb, var(--vscode-editor-background) 92%, white 8%); }
.meta { color: var(--vscode-descriptionForeground); font-size: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 0; }
.chip { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 8px; font-size: 12px; }
pre { white-space: pre-wrap; word-break: break-word; overflow: auto; }
ul { margin: 8px 0 0; padding-left: 18px; }
.toolbar, .form-row, .decision-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.form-col { display: grid; gap: 6px; }
.form-col.compact { min-width: 140px; flex: 1 1 140px; }
.form-col.wide { flex: 3 1 320px; }
.decision-meta { margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<header>
  <div>
    <h2>${escapeHtml(normalizedString(model?.task?.title, model?.task?.taskId || "AgentOps Thread"))}</h2>
    <div class="meta">taskId=${escapeHtml(normalizedString(model?.task?.taskId))} | status=${escapeHtml(normalizedString(model?.task?.status))} | latestSession=${escapeHtml(normalizedString(model?.task?.latestSessionId, "-"))}</div>
    <div class="meta">${escapeHtml(normalizedString(model?.task?.intent, "No intent recorded."))}</div>
  </div>
  <div class="toolbar">
    <button id="refresh" type="button">Refresh</button>
    <label for="session-select">Session</label>
    <select id="session-select">${sessionOptions}</select>
  </div>
</header>
<div class="panel-grid">
  ${governedUpdateBlock}
  <section class="panel">
    <h3>Governed Turn</h3>
    <div class="meta">Submit the next governed turn against this task on the existing M16 or M18 contract.</div>
    <div class="form-row">
      <div class="form-col compact">
        <label for="execution-mode">Execution Path</label>
        <select id="execution-mode">
          <option value="raw_model_invoke">Raw Model Invoke</option>
          <option value="managed_codex_worker">Managed Codex Worker</option>
        </select>
      </div>
      <div class="form-col compact">
        <label for="agent-profile">Agent Profile</label>
        <input id="agent-profile" type="text" value="codex" />
      </div>
      <div class="form-col compact">
        <label for="max-output-tokens">Max Output Tokens</label>
        <input id="max-output-tokens" type="number" value="256" min="0" step="1" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-col wide">
        <label for="turn-prompt">Prompt</label>
        <textarea id="turn-prompt" placeholder="Describe the governed task for this thread."></textarea>
      </div>
    </div>
    <div class="form-row">
      <div class="form-col wide">
        <label for="system-prompt">System Prompt (optional)</label>
        <input id="system-prompt" type="text" value="" />
      </div>
    </div>
    <div class="toolbar">
      <button id="send-turn" type="button">Send Governed Turn</button>
    </div>
  </section>
  <section class="panel">
    <h3>Managed Worker Review</h3>
    <div class="meta">session=${escapeHtml(normalizedString(model?.selectedSession?.sessionId, "-"))} | worker=${escapeHtml(normalizedString(selectedSummary?.selectedWorker?.workerId, "-"))}</div>
    <div class="chips">
      <span class="chip">task=${escapeHtml(normalizedString(selectedActivity?.taskStatus, "-"))}</span>
      <span class="chip">session=${escapeHtml(normalizedString(selectedActivity?.sessionStatus, "-"))}</span>
      <span class="chip">worker=${escapeHtml(normalizedString(selectedActivity?.selectedWorkerStatus, "-"))}</span>
      <span class="chip">mode=${escapeHtml(normalizedString(selectedActivity?.executionMode, "-"))}</span>
      <span class="chip">route=${escapeHtml(normalizedString(selectedSummary?.route, "-"))}</span>
      <span class="chip">boundary=${escapeHtml(normalizedString(selectedSummary?.boundaryProviderId, "-"))}</span>
    </div>
    <div class="meta">${escapeHtml(normalizedString(selectedActivity?.latestWorkerSummary, selectedActivity?.resolutionMessage || "No worker summary available."))}</div>
    ${transcriptBlock}
  </section>
  <section class="panel">
    <h3>Approvals</h3>
    <ul>${approvals}</ul>
  </section>
  <section class="panel">
    <h3>Tool Proposals</h3>
    <ul>${proposals}</ul>
  </section>
  <section class="panel">
    <h3>Tool Actions</h3>
    <ul>${toolActions}</ul>
  </section>
  <section class="panel">
    <h3>Evidence</h3>
    <ul>${evidence}</ul>
  </section>
  <section class="panel">
    <h3>Worker Progress</h3>
    <ul>${progress}</ul>
  </section>
  <section class="panel">
    <h3>Recent Events</h3>
    <ul>${events}</ul>
  </section>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  document.getElementById('session-select').addEventListener('change', (event) => {
    vscode.postMessage({ type: 'focusSession', sessionId: event.target.value });
  });
  document.getElementById('send-turn').addEventListener('click', () => {
    vscode.postMessage({
      type: 'sendTurn',
      executionMode: document.getElementById('execution-mode').value,
      agentProfileId: document.getElementById('agent-profile').value,
      maxOutputTokens: document.getElementById('max-output-tokens').value,
      prompt: document.getElementById('turn-prompt').value,
      systemPrompt: document.getElementById('system-prompt').value
    });
  });
  document.body.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }
    const action = button.dataset.action || '';
    const sessionId = button.dataset.sessionId || '';
    const itemId = button.dataset.itemId || '';
    const reason = window.prompt('Decision reason (optional):', '') || '';
    if (action === 'approval:approve' || action === 'approval:deny') {
      vscode.postMessage({
        type: 'approvalDecision',
        sessionId,
        checkpointId: itemId,
        decision: action.endsWith('deny') ? 'DENY' : 'APPROVE',
        reason
      });
      return;
    }
    if (action === 'proposal:approve' || action === 'proposal:deny') {
      vscode.postMessage({
        type: 'proposalDecision',
        sessionId,
        proposalId: itemId,
        decision: action.endsWith('deny') ? 'DENY' : 'APPROVE',
        reason
      });
    }
  });
</script>
</body>
</html>`;
}

async function pickThread(provider) {
  const children = await provider.getChildren();
  const threadItems = children.filter((item) => item instanceof ThreadItem);
  if (!threadItems.length) {
    vscode.window.showInformationMessage("No AgentOps threads are available for the current scope.");
    return null;
  }
  return vscode.window.showQuickPick(
    threadItems.map((item) => ({
      label: normalizedString(item.task?.title, item.task?.taskId),
      description: item.description,
      detail: normalizedString(item.task?.taskId),
      item
    })),
    {
      title: "Resume AgentOps Thread Review"
    }
  );
}

function createClient() {
  return new AgentOpsRuntimeClient(() => vscode.workspace.getConfiguration("agentops"));
}

function activate(context) {
  const client = createClient();
  const provider = new AgentOpsThreadProvider(client);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("agentopsThreads", provider),
    vscode.commands.registerCommand("agentops.refreshThreads", () => provider.refresh()),
    vscode.commands.registerCommand("agentops.resumeThread", async (item) => {
      const selected = item instanceof ThreadItem ? { item } : await pickThread(provider);
      if (!selected?.item) {
        return;
      }
      ThreadPanel.createOrShow(context, client, selected.item);
    }),
    vscode.commands.registerCommand("agentops.openThreadById", async () => {
      const taskId = await vscode.window.showInputBox({
        title: "Open AgentOps thread by task ID",
        prompt: "Enter an M16 taskId"
      });
      if (!normalizedString(taskId)) {
        return;
      }
      try {
        const thread = await client.loadThread(normalizedString(taskId), {
          tenantId: client.getTenantId(),
          projectId: client.getProjectId(),
          includeLegacy: client.includeLegacySessions()
        });
        const item = new ThreadItem(thread.task, thread.sessions);
        ThreadPanel.createOrShow(context, client, item);
      } catch (error) {
        vscode.window.showErrorMessage(`AgentOps thread open failed: ${error.message || error}`);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("agentops")) {
        provider.refresh();
      }
    })
  );
}

function deactivate() {
  return undefined;
}

module.exports = {
  activate,
  deactivate
};
