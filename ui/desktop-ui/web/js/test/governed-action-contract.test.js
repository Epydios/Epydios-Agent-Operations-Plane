import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGovernedActionPolicyGates,
  buildGovernedActionRequest,
  GOVERNED_ACTION_CONTRACT_ID,
  GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER,
  normalizeGovernedActionDraft
} from "../runtime/governed-action-contract.js";

test("governed action contract normalizes a finance-oriented external action request", () => {
  const normalized = normalizeGovernedActionDraft({
    tenantId: "tenant-local",
    projectId: "project-local",
    subjectId: "alice",
    actionType: "trade.execute",
    resourceKind: "broker-order",
    resourceName: "paper-trade-001",
    boundaryClass: "external_actuator",
    riskTier: "high",
    requiredGrantsText: "grant.trading.supervisor, grant.ops.review",
    evidenceReadiness: "PARTIAL",
    handshakeRequired: true,
    demoProfile: GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER
  });

  assert.equal(normalized.boundaryClass, "external_actuator");
  assert.equal(normalized.riskTier, "high");
  assert.deepEqual(normalized.requiredGrants, [
    "grant.trading.supervisor",
    "grant.ops.review"
  ]);
  assert.equal(normalized.demoProfile, GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER);
});

test("governed action contract request uses explicit contract metadata and standard policy fields", () => {
  const payload = buildGovernedActionRequest({
    tenantId: "tenant-local",
    projectId: "project-local",
    subjectId: "alice",
    actionType: "trade.execute",
    resourceKind: "broker-order",
    resourceName: "paper-trade-001",
    boundaryClass: "external_actuator",
    riskTier: "high",
    requiredGrantsText: "grant.trading.supervisor",
    evidenceReadiness: "PARTIAL",
    handshakeRequired: true,
    requestLabel: "Paper Trade Request",
    demoProfile: GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER,
    originSurface: "future_product_workflow"
  });

  assert.equal(payload.context.governed_action.contract_id, GOVERNED_ACTION_CONTRACT_ID);
  assert.equal(payload.context.governed_action.request_label, "Paper Trade Request");
  assert.equal(payload.context.governed_action.demo_profile, GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER);
  assert.equal(payload.context.policy_stratification.boundary_class, "external_actuator");
  assert.deepEqual(payload.context.policy_stratification.required_grants, ["grant.trading.supervisor"]);
});

test("governed action gates no longer depend on a hidden probe marker", () => {
  const gates = buildGovernedActionPolicyGates({
    requiredGrantsText: "grant.trading.supervisor",
    evidenceReadiness: "PARTIAL",
    handshakeRequired: true
  });

  assert.equal(gates["core09.gates.required_grants_enforced"], true);
  assert.equal(gates["core09.gates.evidence_readiness_enforced"], true);
  assert.equal(gates["core14.adapter_present.enforce_handshake"], true);
  assert.equal(Object.prototype.hasOwnProperty.call(gates, "aimxsRichnessProbe"), false);
});
