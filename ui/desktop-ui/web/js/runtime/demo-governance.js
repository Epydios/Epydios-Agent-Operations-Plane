import {
  GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER,
  normalizeGovernedActionEvidenceReadiness
} from "./governed-action-contract.js";

export const DEMO_GOVERNANCE_STATE_KEY = "epydios.agentops.desktop.demo.governance.v1";

function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeCsvList(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function readNestedObject(input, key) {
  const candidate = input && typeof input === "object" ? input[key] : null;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
}

export function normalizeDemoGovernanceOverlay(input = {}) {
  const persona = readNestedObject(input, "persona");
  const policy = readNestedObject(input, "policy");
  const roles = Array.isArray(persona.roles) ? persona.roles : normalizeCsvList(persona.rolesText);
  return {
    persona: {
      enabled: Boolean(persona.enabled),
      label: normalizedString(persona.label, "Local Demo Persona"),
      subjectId: normalizedString(persona.subjectId),
      clientId: normalizedString(persona.clientId),
      rolesText: roles.join(", "),
      roles,
      tenantScope: normalizedString(persona.tenantScope),
      projectScope: normalizedString(persona.projectScope),
      approvedForProd: Boolean(persona.approvedForProd)
    },
    policy: {
      enabled: Boolean(policy.enabled),
      reviewMode:
        normalizedString(policy.reviewMode).toLowerCase() === "manual_review"
          ? "manual_review"
          : "policy_first",
      handshakeRequired: policy.handshakeRequired !== false,
      advisoryAutoShape: policy.advisoryAutoShape !== false,
      financeSupervisorGrant: policy.financeSupervisorGrant !== false,
      financeEvidenceReadiness: normalizeGovernedActionEvidenceReadiness(policy.financeEvidenceReadiness),
      productionDeleteDeny: policy.productionDeleteDeny !== false,
      policyBucketPrefix: normalizedString(policy.policyBucketPrefix, "desktop-demo")
    }
  };
}

export function validateDemoGovernanceOverlay(overlay = {}) {
  const normalized = normalizeDemoGovernanceOverlay(overlay);
  const errors = [];
  const warnings = [];
  if (normalized.persona.enabled && !normalized.persona.subjectId) {
    errors.push("Demo persona subject ID is required when the persona overlay is enabled.");
  }
  if (normalized.policy.enabled && !normalized.policy.policyBucketPrefix) {
    errors.push("Policy bucket prefix is required when the local demo policy overlay is enabled.");
  }
  if (normalized.persona.enabled && normalized.persona.roles.length === 0) {
    warnings.push("Demo persona has no roles. Authority context will be sparse.");
  }
  if (normalized.policy.enabled && normalized.policy.reviewMode === "manual_review") {
    warnings.push("Manual review mode reintroduces human preclearance into demo flows.");
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    overlay: normalized
  };
}

export function buildDemoGovernanceContext(overlay = {}, session = {}) {
  const normalized = normalizeDemoGovernanceOverlay(overlay);
  const sessionClaims = session?.claims && typeof session.claims === "object" ? session.claims : {};
  const personaEnabled = normalized.persona.enabled;
  const policyEnabled = normalized.policy.enabled;
  if (!personaEnabled && !policyEnabled) {
    return null;
  }
  return {
    source: "desktop_settings_local_demo",
    persona: personaEnabled
      ? {
          enabled: true,
          label: normalized.persona.label,
          subjectId: normalized.persona.subjectId,
          clientId: normalized.persona.clientId,
          roles: [...normalized.persona.roles],
          tenantScopes: normalizeCsvList(normalized.persona.tenantScope || sessionClaims.tenant_id || ""),
          projectScopes: normalizeCsvList(normalized.persona.projectScope || sessionClaims.project_id || ""),
          approvedForProd: normalized.persona.approvedForProd
        }
      : null,
    policy: policyEnabled
      ? {
          enabled: true,
          reviewMode: normalized.policy.reviewMode,
          handshakeRequired: normalized.policy.handshakeRequired,
          advisoryAutoShape: normalized.policy.advisoryAutoShape,
          financeSupervisorGrant: normalized.policy.financeSupervisorGrant,
          financeEvidenceReadiness: normalized.policy.financeEvidenceReadiness,
          productionDeleteDeny: normalized.policy.productionDeleteDeny,
          policyBucketPrefix: normalized.policy.policyBucketPrefix
        }
      : null
  };
}

export function applyDemoGovernanceToGovernedActionInput(input = {}, overlay = {}, session = {}) {
  const normalized = normalizeDemoGovernanceOverlay(overlay);
  const next = {
    ...input
  };
  if (normalized.persona.enabled && !normalizedString(next.subjectId)) {
    next.subjectId =
      normalized.persona.subjectId ||
      normalizedString(session?.claims?.sub) ||
      normalizedString(next.subjectId);
  }
  if (normalized.policy.enabled) {
    next.handshakeRequired = normalized.policy.handshakeRequired;
    if (normalizedString(next.demoProfile) === GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER) {
      if (normalized.policy.financeSupervisorGrant && normalizedString(next.riskTier).toLowerCase() === "high") {
        next.requiredGrantsText = "grant.trading.supervisor";
        next.evidenceReadiness = normalized.policy.financeEvidenceReadiness;
      }
    }
  }
  return next;
}
