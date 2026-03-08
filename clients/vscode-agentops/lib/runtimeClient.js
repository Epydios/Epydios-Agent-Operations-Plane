function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

class RuntimeClientError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "RuntimeClientError";
    this.status = status;
  }
}

function withQuery(url, params = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    const text = String(value).trim();
    if (!text) {
      return;
    }
    url.searchParams.set(key, text);
  });
  return url;
}

function parseEventStream(raw = "") {
  return String(raw)
    .split(/\n\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const payload = chunk
        .split(/\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!payload) {
        return null;
      }
      try {
        return JSON.parse(payload);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

class AgentOpsRuntimeClient {
  constructor(configGetter) {
    this.configGetter = configGetter;
  }

  config() {
    const section = typeof this.configGetter === "function" ? this.configGetter() : null;
    return {
      runtimeApiBaseUrl: normalizedString(section?.get("runtimeApiBaseUrl"), "http://127.0.0.1:8080"),
      tenantId: normalizedString(section?.get("tenantId")),
      projectId: normalizedString(section?.get("projectId")),
      authToken: normalizedString(section?.get("authToken")),
      liveFollowWaitSeconds: Number(section?.get("liveFollowWaitSeconds") || 12) || 12,
      includeLegacySessions: Boolean(section?.get("includeLegacySessions"))
    };
  }

  getTenantId() {
    return this.config().tenantId;
  }

  getProjectId() {
    return this.config().projectId;
  }

  getLiveFollowWaitSeconds() {
    return this.config().liveFollowWaitSeconds;
  }

  includeLegacySessions() {
    return this.config().includeLegacySessions;
  }

  async request(path, options = {}) {
    const config = this.config();
    const url = new URL(path, config.runtimeApiBaseUrl);
    if (options.query) {
      withQuery(url, options.query);
    }
    const headers = {
      Accept: options.accept || "application/json"
    };
    if (config.authToken) {
      headers.Authorization = `Bearer ${config.authToken}`;
    }
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url.toString(), {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new RuntimeClientError(`HTTP ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`, response.status);
    }
    if (options.accept === "text/event-stream") {
      return response.text();
    }
    return response.json();
  }

  async listTasks(query = {}) {
    return this.request("/v1alpha2/runtime/tasks", { query });
  }

  async listSessions(query = {}) {
    return this.request("/v1alpha2/runtime/sessions", { query });
  }

  async getSessionTimeline(sessionId) {
    return this.request(`/v1alpha2/runtime/sessions/${encodeURIComponent(normalizedString(sessionId))}/timeline`);
  }

  async getSessionEventStream(sessionId, options = {}) {
    const raw = await this.request(
      `/v1alpha2/runtime/sessions/${encodeURIComponent(normalizedString(sessionId))}/events/stream`,
      {
        query: {
          afterSequence: options.afterSequence,
          waitSeconds: options.waitSeconds,
          follow: options.follow ? "true" : ""
        },
        accept: "text/event-stream"
      }
    );
    return {
      sessionId: normalizedString(sessionId),
      items: parseEventStream(raw)
    };
  }

  async listWorkerCapabilities(query = {}) {
    return this.request("/v1alpha2/runtime/worker-capabilities", { query });
  }

  async listPolicyPacks(query = {}) {
    return this.request("/v1alpha2/runtime/policy-packs", { query });
  }

  async listExportProfiles(query = {}) {
    return this.request("/v1alpha2/runtime/export-profiles", { query });
  }

  async listOrgAdminProfiles(query = {}) {
    return this.request("/v1alpha2/runtime/org-admin-profiles", { query });
  }

  async submitSessionApprovalDecision(sessionId, checkpointId, decision, options = {}) {
    const normalizedSessionId = normalizedString(sessionId);
    const normalizedCheckpointId = normalizedString(checkpointId);
    const normalizedDecision = normalizedString(decision).toUpperCase() === "DENY" ? "DENY" : "APPROVE";
    if (!normalizedSessionId || !normalizedCheckpointId) {
      throw new RuntimeClientError("sessionId and checkpointId are required");
    }
    return this.request(
      `/v1alpha2/runtime/sessions/${encodeURIComponent(normalizedSessionId)}/approval-checkpoints/${encodeURIComponent(normalizedCheckpointId)}/decision`,
      {
        method: "POST",
        body: {
          meta: {
            tenantId: normalizedString(options.tenantId, this.getTenantId()),
            projectId: normalizedString(options.projectId, this.getProjectId()),
            requestId: normalizedString(options.requestId, `vscode-approval-${Date.now()}`)
          },
          decision: normalizedDecision,
          reason: normalizedString(options.reason)
        }
      }
    );
  }

  async submitSessionToolProposalDecision(sessionId, proposalId, decision, options = {}) {
    const normalizedSessionId = normalizedString(sessionId);
    const normalizedProposalId = normalizedString(proposalId);
    const normalizedDecision = normalizedString(decision).toUpperCase() === "DENY" ? "DENY" : "APPROVE";
    if (!normalizedSessionId || !normalizedProposalId) {
      throw new RuntimeClientError("sessionId and proposalId are required");
    }
    return this.request(
      `/v1alpha2/runtime/sessions/${encodeURIComponent(normalizedSessionId)}/tool-proposals/${encodeURIComponent(normalizedProposalId)}/decision`,
      {
        method: "POST",
        body: {
          meta: {
            tenantId: normalizedString(options.tenantId, this.getTenantId()),
            projectId: normalizedString(options.projectId, this.getProjectId()),
            requestId: normalizedString(options.requestId, `vscode-proposal-${Date.now()}`)
          },
          decision: normalizedDecision,
          reason: normalizedString(options.reason)
        }
      }
    );
  }

  async invokeAgentTurn(payload = {}) {
    const meta = payload?.meta && typeof payload.meta === "object" ? payload.meta : {};
    const tenantId = normalizedString(meta.tenantId, this.getTenantId());
    const projectId = normalizedString(meta.projectId, this.getProjectId());
    if (!tenantId || !projectId) {
      throw new RuntimeClientError("tenantId and projectId are required");
    }
    const prompt = normalizedString(payload?.prompt);
    if (!prompt) {
      throw new RuntimeClientError("prompt is required");
    }
    return this.request("/v1alpha1/runtime/integrations/invoke", {
      method: "POST",
      body: {
        meta: {
          tenantId,
          projectId,
          requestId: normalizedString(meta.requestId, `vscode-invoke-${Date.now()}`)
        },
        taskId: normalizedString(payload?.taskId),
        agentProfileId: normalizedString(payload?.agentProfileId, "codex"),
        executionMode: normalizedString(payload?.executionMode, "raw_model_invoke"),
        prompt,
        systemPrompt: normalizedString(payload?.systemPrompt),
        maxOutputTokens: Number(payload?.maxOutputTokens || 0) || 0
      }
    });
  }

  async loadThread(taskId, options = {}) {
    const normalizedTaskId = normalizedString(taskId);
    if (!normalizedTaskId) {
      throw new RuntimeClientError("taskId is required");
    }
    const taskHint = options.taskHint && typeof options.taskHint === "object" ? options.taskHint : null;
    const taskResponse = await this.listTasks({
      tenantId: normalizedString(options.tenantId),
      projectId: normalizedString(options.projectId),
      limit: 100,
      offset: 0
    });
    const tasks = Array.isArray(taskResponse?.items) ? taskResponse.items : [];
    const task = taskHint || tasks.find((item) => normalizedString(item?.taskId) === normalizedTaskId);
    if (!task) {
      throw new RuntimeClientError(`task not found: ${normalizedTaskId}`, 404);
    }
    const sessionResponse = await this.listSessions({
      taskId: normalizedTaskId,
      tenantId: normalizedString(options.tenantId),
      projectId: normalizedString(options.projectId),
      includeLegacy: options.includeLegacy ? "true" : "",
      limit: 25,
      offset: 0
    });
    const sessions = Array.isArray(sessionResponse?.items) ? sessionResponse.items : [];
    const sessionHintsById = new Map(
      (Array.isArray(options.sessionHints) ? options.sessionHints : [])
        .map((item) => [normalizedString(item?.sessionId), item])
        .filter(([id]) => Boolean(id))
    );
    const sessionViews = [];
    for (const session of sessions.sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0).getTime() - new Date(a?.updatedAt || a?.createdAt || 0).getTime())) {
      const sessionId = normalizedString(session?.sessionId);
      const timeline = await this.getSessionTimeline(sessionId);
      sessionViews.push({
        session,
        timeline,
        streamItems: [],
        sessionHint: sessionHintsById.get(sessionId) || null
      });
    }
    return {
      task,
      tasks,
      sessions,
      sessionViews
    };
  }
}

module.exports = {
  AgentOpsRuntimeClient,
  RuntimeClientError,
  parseEventStream
};
