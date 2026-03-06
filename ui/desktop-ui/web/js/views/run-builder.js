import { escapeHTML, renderPanelStateMetric } from "./common.js";

function parseList(raw) {
  const values = String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function parseTier(raw) {
  const value = Number.parseInt(String(raw || ""), 10);
  if (value === 1 || value === 3) {
    return value;
  }
  return 2;
}

export function ensureRunBuilderDefaults(ui, session) {
  const claims = session?.claims || {};
  if (ui.rbTenantId && !ui.rbTenantId.value && claims.tenant_id) {
    ui.rbTenantId.value = claims.tenant_id;
  }
  if (ui.rbProjectId && !ui.rbProjectId.value && claims.project_id) {
    ui.rbProjectId.value = claims.project_id;
  }
}

export function readRunBuilderInput(ui) {
  return {
    requestId: String(ui.rbRequestId?.value || "").trim(),
    tenantId: String(ui.rbTenantId?.value || "").trim(),
    projectId: String(ui.rbProjectId?.value || "").trim(),
    environment: String(ui.rbEnvironment?.value || "").trim() || "staging",
    tier: parseTier(ui.rbTier?.value),
    targetOS: String(ui.rbTargetOS?.value || "").trim().toLowerCase() || "linux",
    targetExecutionProfile:
      String(ui.rbTargetProfile?.value || "").trim().toLowerCase() || "sandbox_vm_autonomous",
    stepId: String(ui.rbStepId?.value || "").trim() || "desktop-step-1",
    requestedCapabilities: parseList(ui.rbCapabilities?.value),
    requiredVerifierIds: parseList(ui.rbVerifierIds?.value),
    actionType: String(ui.rbActionType?.value || "").trim() || "click",
    actionSelector: String(ui.rbActionSelector?.value || "").trim() || "#approve",
    postActionVerify: String(ui.rbPostAction?.value || "").trim() || "post_action_state",
    actionTarget: String(ui.rbActionTarget?.value || "").trim() || "desktop-sandbox",
    humanApprovalGranted: Boolean(ui.rbHumanApprovalGranted?.checked),
    restrictedHostOptIn: Boolean(ui.rbRestrictedHostOptIn?.checked),
    dryRun: Boolean(ui.rbDryRun?.checked)
  };
}

export function evaluateRunBuilderIssues(input) {
  const issues = [];

  if (!input.tenantId) {
    issues.push({ severity: "error", message: "Tenant is required." });
  }
  if (!input.projectId) {
    issues.push({ severity: "error", message: "Project is required." });
  }
  if (!input.requestedCapabilities.length && input.tier > 1) {
    issues.push({ severity: "error", message: "At least one capability is required for desktop tiers." });
  }
  if (input.targetExecutionProfile === "restricted_host" && !input.restrictedHostOptIn) {
    issues.push({
      severity: "warn",
      message: "restricted_host requires restrictedHostOptIn=true; runtime deny-path should trigger without opt-in."
    });
  }
  if (input.tier >= 3 && !input.humanApprovalGranted) {
    issues.push({
      severity: "warn",
      message: "Tier 3 requires explicit human approval and a policy grant token to proceed."
    });
  }
  if (input.targetOS !== "linux") {
    issues.push({
      severity: "warn",
      message: "Linux-first guardrail is active by default; non-Linux targets are blocked unless runtime enables them."
    });
  }

  return issues;
}

export function buildRunCreatePayload(input, session) {
  const actorSub = String(session?.claims?.sub || "").trim();
  const requestId = input.requestId || `req-ui-${Date.now()}`;

  return {
    meta: {
      requestId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      environment: input.environment,
      actor: {
        type: "operator_ui",
        id: actorSub || "anonymous-operator"
      }
    },
    subject: {
      type: "operator",
      id: actorSub || "anonymous-operator"
    },
    action: {
      verb: "desktop.step",
      target: input.actionTarget
    },
    mode: "enforce",
    dryRun: input.dryRun,
    desktop: {
      enabled: true,
      tier: input.tier,
      targetOS: input.targetOS,
      targetExecutionProfile: input.targetExecutionProfile,
      stepId: input.stepId,
      requestedCapabilities: input.requestedCapabilities,
      requiredVerifierIds: input.requiredVerifierIds,
      observer: {
        mode: "snapshot"
      },
      actuation: {
        type: input.actionType,
        selector: input.actionSelector
      },
      postAction: {
        verify: input.postActionVerify
      },
      humanApprovalGranted: input.humanApprovalGranted,
      restrictedHostOptIn: input.restrictedHostOptIn
    }
  };
}

export function renderRunBuilderPayload(ui, payload) {
  if (!ui.runBuilderPayload) {
    return;
  }
  ui.runBuilderPayload.textContent = JSON.stringify(payload || {}, null, 2);
}

export function renderRunBuilderPolicyHints(ui, input, issues) {
  if (!ui.runBuilderPolicyHints) {
    return;
  }

  const tierHint =
    input.tier <= 1
      ? "Tier 1 selected: connectors/API-first path; desktop loop should be skipped."
      : input.tier === 2
        ? "Tier 2 selected: desktop actuation path is allowed when policy decision permits."
        : "Tier 3 selected: runtime requires humanApprovalGranted=true and policy grant token.";

  const profileHint =
    input.targetExecutionProfile === "restricted_host"
      ? "restricted_host selected: blocked by default unless explicit restricted-host opt-in and policy allow are present."
      : "sandbox_vm_autonomous selected: baseline autonomous profile.";

  const issueMetrics =
    issues.length === 0
      ? renderPanelStateMetric("success", "Validation", "No blocking validation issues detected in form input.")
      : issues
          .map((issue) => {
            const level = issue.severity === "error" ? "ERROR" : "WARN";
            const state = issue.severity === "error" ? "error" : "warn";
            return `
              ${renderPanelStateMetric(state, level, issue.message)}
            `;
          })
          .join("");

  ui.runBuilderPolicyHints.innerHTML = `
    ${renderPanelStateMetric("info", "Tier Policy", tierHint)}
    ${renderPanelStateMetric("info", "Execution Profile Policy", profileHint)}
    ${issueMetrics}
  `;
}

export function renderRunBuilderFeedback(ui, tone, message) {
  if (!ui.runBuilderFeedback) {
    return;
  }
  const title = tone === "error" ? "Run Submission Failed" : tone === "ok" ? "Run Submitted" : "Run Builder";
  const state = tone === "error" ? "error" : tone === "ok" ? "success" : tone === "warn" ? "warn" : "info";
  ui.runBuilderFeedback.innerHTML = renderPanelStateMetric(state, title, message || "");
}
