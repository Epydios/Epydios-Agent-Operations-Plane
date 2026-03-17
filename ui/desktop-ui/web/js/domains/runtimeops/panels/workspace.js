import { chipClassForStatus, escapeHTML } from "../../../views/common.js";
import { renderAimxsIdentityPostureBlock } from "../../../shared/components/aimxs-identity-posture.js";
import { renderAimxsRouteBoundaryBlock } from "../../../shared/components/aimxs-route-boundary.js";
import { createRuntimeWorkspaceSnapshot } from "../state.js";

function chipClassForTone(value) {
  const tone = String(value || "").trim().toLowerCase();
  if (tone === "ok") {
    return "chip chip-ok chip-compact";
  }
  if (tone === "warn") {
    return "chip chip-warn chip-compact";
  }
  if (tone === "danger" || tone === "error") {
    return "chip chip-danger chip-compact";
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
        <span class="runtimeops-value-pill">
          <span class="runtimeops-value-key">${escapeHTML(label)}</span>
          <span class="runtimeops-value-text${item?.code ? " runtimeops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="runtimeops-empty">not available</span>';
  }
  return `<div class="runtimeops-value-group">${values.join("")}</div>`;
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
        <div class="runtimeops-row">
          <div class="runtimeops-row-label">${escapeHTML(label)}</div>
          <div class="runtimeops-row-value">${value || '<span class="runtimeops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderRuntimeActionButton(label, dataset = {}, disabled = false, tone = "secondary") {
  const attrs = Object.entries(dataset)
    .map(([key, value]) => {
      const normalizedValue = String(value || "").trim();
      return normalizedValue ? ` data-${escapeHTML(key)}="${escapeHTML(normalizedValue)}"` : "";
    })
    .join("");
  const className = tone === "primary" ? "btn btn-primary btn-small" : "btn btn-secondary btn-small";
  return `<button class="${className}" type="button"${attrs}${disabled ? " disabled" : ""}>${escapeHTML(label)}</button>`;
}

function renderRuntimeActionsBoard(snapshot) {
  const review = snapshot.actionReview || {};
  const feedback = review.feedback?.message
    ? `
      <div class="runtimeops-feedback runtimeops-feedback-${escapeHTML(review.feedback.tone || "info")}">
        ${escapeHTML(review.feedback.message)}
      </div>
    `
    : "";
  const rows = [
    {
      label: "Run Focus",
      value: `
        ${renderValuePills([
          { label: "run", value: review.run?.runId, code: true },
          { label: "status", value: review.run?.status },
          { label: "decision", value: review.run?.decision }
        ])}
        <div class="runtimeops-action-row">
          ${renderRuntimeActionButton(
            "Open Run Detail",
            { "runtimeops-open-run-id": review.run?.runId },
            !review.run?.actionable,
            "primary"
          )}
        </div>
      `
    },
    {
      label: "Session Control",
      value: `
        ${renderValuePills([
          { label: "session", value: review.session?.sessionId, code: true },
          { label: "task", value: review.session?.taskId, code: true },
          { label: "status", value: review.session?.status },
          { label: "scope", value: `${review.session?.tenantId || "-"} / ${review.session?.projectId || "-"}` }
        ])}
        <div class="runtimeops-action-row">
          ${renderRuntimeActionButton(
            "Review Session",
            { "runtimeops-review-session-id": review.session?.sessionId },
            !review.session?.actionable,
            "primary"
          )}
          ${renderRuntimeActionButton(
            "Close Session",
            { "runtimeops-close-session-id": review.session?.sessionId },
            !review.session?.closeAllowed
          )}
        </div>
      `
    },
    {
      label: "Worker Control",
      value: `
        ${renderValuePills([
          { label: "worker", value: review.worker?.workerId, code: true },
          { label: "capability", value: review.worker?.capabilityLabel },
          { label: "adapter", value: review.worker?.capabilityAdapterId, code: true },
          { label: "provider", value: review.worker?.capabilityProvider, code: true }
        ])}
        <div class="runtimeops-action-row">
          ${renderRuntimeActionButton(
            "Attach Worker",
            { "runtimeops-attach-session-id": review.session?.sessionId },
            !review.worker?.attachAllowed
          )}
          ${renderRuntimeActionButton(
            "Heartbeat",
            {
              "runtimeops-worker-event-session-id": review.session?.sessionId,
              "runtimeops-worker-event-worker-id": review.worker?.workerId,
              "runtimeops-worker-event-type": "heartbeat"
            },
            !review.worker?.heartbeatAllowed
          )}
          ${renderRuntimeActionButton(
            "Reattach",
            {
              "runtimeops-worker-event-session-id": review.session?.sessionId,
              "runtimeops-worker-event-worker-id": review.worker?.workerId,
              "runtimeops-worker-event-type": "reattach"
            },
            !review.worker?.reattachAllowed
          )}
        </div>
      `
    }
  ];
  return `
    <article class="metric runtimeops-card runtimeops-action-board" data-domain-root="runtimeops" data-runtimeops-panel="workspace-actions">
      <div class="metric-title-row">
        <div class="title">Runtime Actions</div>
        <span class="chip chip-ok chip-compact">operational</span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="chip chip-neutral chip-compact">run=${escapeHTML(String(review.run?.runId || "-"))}</span>
        <span class="chip chip-neutral chip-compact">session=${escapeHTML(String(review.session?.sessionId || "-"))}</span>
        <span class="chip chip-neutral chip-compact">worker=${escapeHTML(String(review.worker?.workerId || "-"))}</span>
      </div>
      ${feedback}
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderProgressList(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      const detail = String(item?.detail || "").trim();
      const timestamp = String(item?.timestamp || "").trim();
      if (!label && !detail) {
        return "";
      }
      return `
        <div class="runtimeops-progress-item">
          <div class="runtimeops-progress-head">
            <span class="${chipClassForTone(item?.tone)}">${escapeHTML(label || "Session Event")}</span>
            <span class="runtimeops-progress-meta">
              ${item?.sequence ? `seq ${escapeHTML(String(item.sequence))}` : ""}
              ${timestamp ? `${item?.sequence ? " · " : ""}${escapeHTML(timestamp)}` : ""}
            </span>
          </div>
          <div class="runtimeops-progress-detail">${escapeHTML(detail || "-")}</div>
        </div>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="runtimeops-empty">not available</span>';
  }
  return `<div class="runtimeops-progress-list">${values.join("")}</div>`;
}

function renderSelectedSessionReviewBoard(snapshot) {
  const review = snapshot.selectedSessionReview;
  const toneLabel =
    review.state === "loading"
      ? "loading"
      : review.loaded
        ? "loaded"
        : review.available
          ? "bounded"
          : "idle";
  const rows = [
    {
      label: "Review State",
      value: `
        ${renderValuePills([
          { label: "session", value: review.selectedSessionId, code: true },
          { label: "source", value: review.source, code: true },
          { label: "state", value: review.state }
        ])}
        <div class="runtimeops-session-note">${escapeHTML(review.message)}</div>
      `
    },
    {
      label: "Session State",
      value: `
        ${renderValuePills([
          { label: "request", value: review.requestId, code: true },
          { label: "task", value: review.taskId, code: true },
          { label: "session status", value: review.sessionStatus },
          { label: "task status", value: review.taskStatus },
          { label: "worker", value: review.selectedWorkerId, code: true }
        ])}
        ${
          review.resolutionMessage
            ? `<div class="runtimeops-session-note">${escapeHTML(review.resolutionMessage)}</div>`
            : ""
        }
      `
    },
    {
      label: "Activity",
      value: renderValuePills([
        { label: "events", value: String(review.eventCount) },
        { label: "approvals", value: String(review.openApprovalCount) },
        { label: "proposals", value: String(review.pendingToolProposalCount) },
        { label: "evidence", value: String(review.evidenceCount) },
        { label: "tool actions", value: String(review.toolActionCount) }
      ])
    },
    {
      label: "Latest Event",
      value: `
        ${renderValuePills([
          { label: "label", value: review.latestEventLabel },
          { label: "sequence", value: review.latestEventSequence ? String(review.latestEventSequence) : "-" },
          { label: "worker status", value: review.latestWorkerStatus },
          { label: "mode", value: review.executionMode }
        ])}
        <div class="runtimeops-session-note">${escapeHTML(review.latestEventDetail || "-")}</div>
        <div class="runtimeops-action-row">
          ${renderRuntimeActionButton(
            review.loaded ? "Refresh Review" : "Review Session",
            { "runtimeops-review-session-id": review.selectedSessionId },
            !review.available,
            "primary"
          )}
        </div>
      `
    },
    {
      label: "Recent Progress",
      value: renderProgressList(review.progressItems)
    }
  ];
  return `
    <article class="metric runtimeops-card runtimeops-session-review-board" data-domain-root="runtimeops" data-runtimeops-panel="workspace-selected-session">
      <div class="metric-title-row">
        <div class="title">Selected Session Review</div>
        <span class="${chipClassForTone(review.tone)}">${escapeHTML(toneLabel)}</span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="chip chip-neutral chip-compact">session=${escapeHTML(String(review.selectedSessionId || "-"))}</span>
        <span class="chip chip-neutral chip-compact">events=${escapeHTML(String(review.eventCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">proposals=${escapeHTML(String(review.pendingToolProposalCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">evidence=${escapeHTML(String(review.evidenceCount || 0))}</span>
      </div>
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderWorkerPostureBoard(snapshot) {
  const posture = snapshot.workerPosture;
  const rows = [
    {
      label: "Selected Worker",
      value: renderValuePills([
        { label: "session", value: posture.selectedSessionId, code: true },
        { label: "worker", value: posture.workerId, code: true },
        { label: "type", value: posture.workerType },
        { label: "status", value: posture.workerStatus },
        { label: "latest", value: posture.latestWorkerStatus }
      ])
    },
    {
      label: "Route And Model",
      value: renderValuePills([
        { label: "adapter", value: posture.adapterId, code: true },
        { label: "provider", value: posture.provider, code: true },
        { label: "transport", value: posture.transport },
        { label: "model", value: posture.model }
      ])
    },
    {
      label: "Boundary And Signals",
      value: renderValuePills([
        { label: "target", value: posture.targetEnvironment },
        { label: "source", value: posture.source },
        { label: "boundaries", value: String(posture.boundaryCount) },
        { label: "transcript", value: posture.transcriptAvailable ? "available" : "unavailable" },
        { label: "transcript events", value: String(posture.transcriptEventCount) }
      ])
    },
    {
      label: "Worker Summary",
      value: `
        <div class="runtimeops-session-note">${escapeHTML(posture.latestWorkerSummary || "-")}</div>
        <div class="runtimeops-action-row">
          ${renderRuntimeActionButton(
            "Refresh Review",
            { "runtimeops-review-session-id": posture.selectedSessionId },
            !posture.available
          )}
        </div>
      `
    }
  ];
  return `
    <article class="metric runtimeops-card" data-domain-root="runtimeops" data-runtimeops-panel="workspace-worker-posture">
      <div class="metric-title-row">
        <div class="title">Worker Posture</div>
        <span class="${chipClassForTone(posture.available ? "ok" : "neutral")}">${escapeHTML(
          posture.available ? "selected" : "idle"
        )}</span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="chip chip-neutral chip-compact">worker=${escapeHTML(String(posture.workerId || "-"))}</span>
        <span class="chip chip-neutral chip-compact">boundaries=${escapeHTML(String(posture.boundaryCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">proposals=${escapeHTML(String(posture.pendingToolProposalCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(posture.openApprovalCount || 0))}</span>
      </div>
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderRuntimeHealthBoard(snapshot) {
  const rows = [
    {
      label: "Runtime API",
      value: renderValuePills([
        { label: "status", value: snapshot.runtimeHealth.runtime.status },
        { label: "detail", value: snapshot.runtimeHealth.runtime.detail }
      ])
    },
    {
      label: "Providers",
      value: renderValuePills([
        { label: "status", value: snapshot.runtimeHealth.providers.status },
        { label: "detail", value: snapshot.runtimeHealth.providers.detail }
      ])
    },
    {
      label: "Policy",
      value: renderValuePills([
        { label: "status", value: snapshot.runtimeHealth.policy.status },
        { label: "detail", value: snapshot.runtimeHealth.policy.detail }
      ])
    },
    {
      label: "Pipeline",
      value: renderValuePills([
        { label: "status", value: snapshot.runtimeHealth.pipeline.status },
        { label: "detail", value: snapshot.runtimeHealth.pipeline.detail }
      ])
    }
  ];
  return `
    <article class="metric runtimeops-card" data-domain-root="runtimeops" data-runtimeops-panel="workspace-health">
      <div class="metric-title-row">
        <div class="title">Runtime Health</div>
        <span class="${chipClassForStatus(snapshot.runtimeHealth.runtime.status)} chip-compact">${escapeHTML(
          String(snapshot.runtimeHealth.runtime.status || "unknown").toUpperCase()
        )}</span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="${chipClassForStatus(snapshot.runtimeHealth.providers.status)} chip-compact">providers</span>
        <span class="${chipClassForStatus(snapshot.runtimeHealth.policy.status)} chip-compact">policy</span>
        <span class="${chipClassForStatus(snapshot.runtimeHealth.pipeline.status)} chip-compact">pipeline</span>
      </div>
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderQueueBoard(snapshot) {
  const queue = snapshot.queueAndThroughput;
  const rows = [
    {
      label: "Loaded Run Set",
      value: renderValuePills([
        { label: "source", value: queue.source, code: true },
        { label: "runs", value: String(queue.totalRuns) },
        { label: "completed", value: String(queue.completedCount) }
      ])
    },
    {
      label: "Backlog Signals",
      value: renderValuePills([
        { label: "active", value: String(queue.activeCount) },
        { label: "attention", value: String(queue.attentionCount) },
        { label: "approvals", value: String(queue.approvalCount) }
      ])
    },
    {
      label: "Latest Run",
      value: renderValuePills([
        { label: "run", value: queue.latestRunId, code: true },
        { label: "updated", value: queue.latestUpdatedAt }
      ])
    }
  ];
  return `
    <article class="metric runtimeops-card" data-domain-root="runtimeops" data-runtimeops-panel="workspace-queue">
      <div class="metric-title-row">
        <div class="title">Queue And Throughput</div>
        <span class="${chipClassForTone(queue.queueTone)}">${escapeHTML(queue.queueTone)}</span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="chip chip-neutral chip-compact">runs=${escapeHTML(String(queue.totalRuns))}</span>
        <span class="chip chip-neutral chip-compact">active=${escapeHTML(String(queue.activeCount))}</span>
        <span class="chip chip-neutral chip-compact">attention=${escapeHTML(String(queue.attentionCount))}</span>
        <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(queue.approvalCount))}</span>
      </div>
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderCapacityBoard(snapshot) {
  const capacity = snapshot.latencyAndCapacity;
  const rows = [
    {
      label: "Provider Readiness",
      value: renderValuePills([
        { label: "ready", value: String(capacity.readyProviders) },
        { label: "degraded", value: String(capacity.degradedProviders) },
        { label: "unknown", value: String(capacity.unknownProviders) }
      ])
    },
    {
      label: "Route Coverage",
      value: renderValuePills([
        { label: "routes", value: String(capacity.routeCount) },
        { label: "policy", value: capacity.latestPolicyProvider, code: true },
        { label: "desktop", value: capacity.latestDesktopProvider, code: true }
      ])
    },
    {
      label: "Freshness",
      value: renderValuePills([
        { label: "signal", value: capacity.freshnessLabel },
        { label: "providers", value: String(capacity.totalProviders) }
      ])
    }
  ];
  return `
    <article class="metric runtimeops-card" data-domain-root="runtimeops" data-runtimeops-panel="workspace-capacity">
      <div class="metric-title-row">
        <div class="title">Latency And Capacity</div>
        <span class="${chipClassForTone(capacity.freshnessTone)}">${escapeHTML(capacity.freshnessLabel)}</span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="chip chip-neutral chip-compact">ready=${escapeHTML(String(capacity.readyProviders))}</span>
        <span class="chip chip-neutral chip-compact">degraded=${escapeHTML(String(capacity.degradedProviders))}</span>
        <span class="chip chip-neutral chip-compact">routes=${escapeHTML(String(capacity.routeCount))}</span>
        <span class="chip chip-neutral chip-compact">providers=${escapeHTML(String(capacity.totalProviders))}</span>
      </div>
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderRunInventoryBoard(snapshot) {
  const inventory = snapshot.runInventory;
  const rows = [
    {
      label: "Current Scope",
      value: renderValuePills([
        { label: "tenant", value: inventory.scopeTenant, code: true },
        { label: "project", value: inventory.scopeProject, code: true }
      ])
    },
    {
      label: "Decision Mix",
      value: renderValuePills([
        { label: "allow", value: String(inventory.allowCount) },
        { label: "deny", value: String(inventory.deniedCount) },
        { label: "evidence", value: String(inventory.evidenceLinkedCount) }
      ])
    },
    {
      label: "Latest Run",
      value: renderValuePills([
        { label: "run", value: inventory.latestRunId, code: true },
        { label: "status", value: inventory.latestRunStatus },
        { label: "decision", value: inventory.latestRunDecision }
      ])
    }
  ];
  return `
    <article class="metric runtimeops-card" data-domain-root="runtimeops" data-runtimeops-panel="workspace-inventory">
      <div class="metric-title-row">
        <div class="title">Run Inventory</div>
        <span class="chip chip-neutral chip-compact">inspect-first</span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="chip chip-neutral chip-compact">runs=${escapeHTML(String(inventory.totalRuns))}</span>
        <span class="chip chip-neutral chip-compact">tenants=${escapeHTML(String(inventory.tenantCount))}</span>
        <span class="chip chip-neutral chip-compact">projects=${escapeHTML(String(inventory.projectCount))}</span>
        <span class="chip chip-neutral chip-compact">evidence=${escapeHTML(String(inventory.evidenceLinkedCount))}</span>
      </div>
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderLiveSessionsBoard(snapshot) {
  const sessions = snapshot.liveSessions;
  const rows = [
    {
      label: "Loaded Session Set",
      value: renderValuePills([
        { label: "source", value: sessions.source, code: true },
        { label: "sessions", value: String(sessions.totalCount) },
        { label: "types", value: String(sessions.sessionTypeCount) }
      ])
    },
    {
      label: "Session Status",
      value: renderValuePills([
        { label: "active", value: String(sessions.activeCount) },
        { label: "terminal", value: String(sessions.terminalCount) },
        { label: "awaiting approval", value: String(sessions.awaitingApprovalCount) }
      ])
    },
    {
      label: "Latest Session",
      value: `
        ${renderValuePills([
          { label: "session", value: sessions.latestSessionId, code: true },
          { label: "status", value: sessions.latestStatus },
          { label: "worker", value: sessions.latestWorkerId, code: true }
        ])}
        <div class="runtimeops-action-row">
          ${renderRuntimeActionButton(
            "Review Session",
            { "runtimeops-review-session-id": sessions.latestSessionId },
            !sessions.latestSessionId || sessions.latestSessionId === "-"
          )}
        </div>
      `
    }
  ];
  return `
    <article class="metric runtimeops-card" data-domain-root="runtimeops" data-runtimeops-panel="workspace-sessions">
      <div class="metric-title-row">
        <div class="title">Live Sessions</div>
        <span class="${chipClassForTone(sessions.awaitingApprovalCount > 0 ? "warn" : sessions.activeCount > 0 ? "ok" : "neutral")}">
          ${escapeHTML(sessions.awaitingApprovalCount > 0 ? "watch" : sessions.activeCount > 0 ? "active" : "quiet")}
        </span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="chip chip-neutral chip-compact">sessions=${escapeHTML(String(sessions.totalCount))}</span>
        <span class="chip chip-neutral chip-compact">active=${escapeHTML(String(sessions.activeCount))}</span>
        <span class="chip chip-neutral chip-compact">terminal=${escapeHTML(String(sessions.terminalCount))}</span>
        <span class="chip chip-neutral chip-compact">workers=${escapeHTML(String(sessions.attachedWorkerCount))}</span>
      </div>
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderWorkerFleetBoard(snapshot) {
  const fleet = snapshot.workerFleet;
  const rows = [
    {
      label: "Capability Catalog",
      value: renderValuePills([
        { label: "source", value: fleet.source, code: true },
        { label: "capabilities", value: String(fleet.totalCount) },
        { label: "adapters", value: String(fleet.adapterCount) }
      ])
    },
    {
      label: "Worker Modes",
      value: renderValuePills([
        { label: "managed", value: String(fleet.managedAgentCount) },
        { label: "model invoke", value: String(fleet.modelInvokeCount) },
        { label: "execution modes", value: String(fleet.executionModeCount) }
      ])
    },
    {
      label: "Latest Capability",
      value: renderValuePills([
        { label: "label", value: fleet.latestLabel },
        { label: "provider", value: fleet.latestProvider, code: true },
        { label: "model", value: fleet.latestModel }
      ])
    }
  ];
  return `
    <article class="metric runtimeops-card" data-domain-root="runtimeops" data-runtimeops-panel="workspace-workers">
      <div class="metric-title-row">
        <div class="title">Worker Fleet</div>
        <span class="chip chip-neutral chip-compact">bounded</span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="chip chip-neutral chip-compact">capabilities=${escapeHTML(String(fleet.totalCount))}</span>
        <span class="chip chip-neutral chip-compact">providers=${escapeHTML(String(fleet.providerCount))}</span>
        <span class="chip chip-neutral chip-compact">boundaries=${escapeHTML(String(fleet.boundaryCoverageCount))}</span>
        <span class="chip chip-neutral chip-compact">attached sessions=${escapeHTML(String(fleet.attachedSessionCount))}</span>
      </div>
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderProviderRoutingBoard(snapshot) {
  const routing = snapshot.providerRouting;
  const rows = [
    {
      label: "Loaded Route Set",
      value: renderValuePills([
        { label: "source", value: routing.source, code: true },
        { label: "runs", value: String(routing.totalRuns) },
        { label: "aimxs policy", value: String(routing.aimxsPolicyCount) }
      ])
    },
    {
      label: "Route Coverage",
      value: renderValuePills([
        { label: "profile", value: String(routing.profileRouteCount) },
        { label: "policy", value: String(routing.policyRouteCount) },
        { label: "evidence", value: String(routing.evidenceRouteCount) },
        { label: "desktop", value: String(routing.desktopRouteCount) }
      ])
    },
    {
      label: "Latest Route Set",
      value: renderValuePills([
        { label: "profile", value: routing.latestProfileProvider, code: true },
        { label: "policy", value: routing.latestPolicyProvider, code: true },
        { label: "evidence", value: routing.latestEvidenceProvider, code: true },
        { label: "desktop", value: routing.latestDesktopProvider, code: true }
      ])
    }
  ];
  return `
    <article class="metric runtimeops-card" data-domain-root="runtimeops" data-runtimeops-panel="workspace-routing">
      <div class="metric-title-row">
        <div class="title">Provider Routing</div>
        <span class="chip chip-neutral chip-compact">bounded</span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="chip chip-neutral chip-compact">profile=${escapeHTML(String(routing.profileRouteCount))}</span>
        <span class="chip chip-neutral chip-compact">policy=${escapeHTML(String(routing.policyRouteCount))}</span>
        <span class="chip chip-neutral chip-compact">evidence=${escapeHTML(String(routing.evidenceRouteCount))}</span>
        <span class="chip chip-neutral chip-compact">desktop=${escapeHTML(String(routing.desktopRouteCount))}</span>
      </div>
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderIdentityApplicationBoard(snapshot) {
  const identity = snapshot.identityApplication;
  const rows = [
    {
      label: "Effective Identity",
      value: renderValuePills([
        { label: "source", value: identity.source, code: true },
        { label: "subject", value: identity.subject, code: true },
        { label: "client", value: identity.clientId, code: true }
      ])
    },
    {
      label: "Authority Application",
      value: renderValuePills([
        { label: "basis", value: identity.authorityBasis },
        { label: "rules", value: String(identity.policyRuleCount) },
        { label: "matrix", value: identity.policyMatrixRequired ? "required" : "not required" }
      ])
    },
    {
      label: "Claim Mapping",
      value: renderValuePills([
        { label: "roles", value: identity.roleClaim, code: true },
        { label: "client", value: identity.clientIdClaim, code: true },
        { label: "tenant", value: identity.tenantClaim, code: true },
        { label: "project", value: identity.projectClaim, code: true }
      ])
    }
  ];
  return `
    <article class="metric runtimeops-card" data-domain-root="runtimeops" data-runtimeops-panel="workspace-identity">
      <div class="metric-title-row">
        <div class="title">Identity Application</div>
        <span class="${chipClassForTone(identity.authenticated ? "ok" : identity.authEnabled ? "warn" : "neutral")}">
          ${escapeHTML(identity.authenticated ? "authenticated" : identity.authEnabled ? "unresolved" : "auth-off")}
        </span>
      </div>
      <div class="runtimeops-chip-row">
        <span class="chip chip-neutral chip-compact">roles=${escapeHTML(String(identity.roleCount))}</span>
        <span class="chip chip-neutral chip-compact">tenants=${escapeHTML(String(identity.tenantCount))}</span>
        <span class="chip chip-neutral chip-compact">projects=${escapeHTML(String(identity.projectCount))}</span>
        <span class="chip chip-neutral chip-compact">permissions=${escapeHTML(String(identity.permissionCount))}</span>
      </div>
      <div class="runtimeops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderAimxsIdentityPostureEchoBoard(snapshot) {
  return `
    <article class="metric runtimeops-card runtimeops-card-wide" data-domain-root="runtimeops" data-runtimeops-panel="aimxs-identity-posture-echo">
      <div class="metric-title-row">
        <div class="title">AIMXS Identity And Posture Echo</div>
        <span class="chip chip-neutral chip-compact">read-only</span>
      </div>
      ${renderAimxsIdentityPostureBlock(snapshot.aimxsIdentityPosture)}
    </article>
  `;
}

function renderAimxsRouteBoundaryEchoBoard(snapshot) {
  return `
    <article class="metric runtimeops-card runtimeops-card-wide" data-domain-root="runtimeops" data-runtimeops-panel="aimxs-route-boundary-echo">
      <div class="metric-title-row">
        <div class="title">AIMXS Route And Boundary Echo</div>
        <span class="chip chip-neutral chip-compact">read-only</span>
      </div>
      ${renderAimxsRouteBoundaryBlock(snapshot.aimxsRouteBoundary)}
    </article>
  `;
}

export function renderRuntimeWorkspace(context = {}, session = {}, options = {}) {
  const snapshot = createRuntimeWorkspaceSnapshot(context, session, options);
  return `
    <div class="runtimeops-workspace" data-domain-root="runtimeops">
      <div class="runtimeops-primary-grid">
        ${renderRuntimeActionsBoard(snapshot)}
        ${renderSelectedSessionReviewBoard(snapshot)}
        ${renderWorkerPostureBoard(snapshot)}
        ${renderRuntimeHealthBoard(snapshot)}
        ${renderQueueBoard(snapshot)}
        ${renderCapacityBoard(snapshot)}
        ${renderLiveSessionsBoard(snapshot)}
        ${renderWorkerFleetBoard(snapshot)}
        ${renderProviderRoutingBoard(snapshot)}
        ${renderAimxsRouteBoundaryEchoBoard(snapshot)}
        ${renderIdentityApplicationBoard(snapshot)}
        ${renderAimxsIdentityPostureEchoBoard(snapshot)}
        ${renderRunInventoryBoard(snapshot)}
      </div>
    </div>
  `;
}
