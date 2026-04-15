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
  assert.equal(normalized.evidenceReadiness, "PARTIAL");
  assert.equal(normalized.requestLabel, "Governed Request");
  assert.equal(normalized.workflowKind, "governed_request");
});

test("governed action contract request uses explicit contract metadata and compact request fields", () => {
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

  assert.equal(payload.context.request.contractId, GOVERNED_ACTION_CONTRACT_ID);
  assert.equal(payload.context.request.requestLabel, "Paper Trade Request");
  assert.equal(payload.context.request.originSurface, "future_product_workflow");
  assert.deepEqual(payload.context.notes, []);
  assert.equal(payload.mode, "enforce");
  assert.equal(payload.dryRun, false);
});

test("governed action gates stay empty in the thin public contract", () => {
  const gates = buildGovernedActionPolicyGates({
    requiredGrantsText: "grant.trading.supervisor",
    evidenceReadiness: "PARTIAL",
    handshakeRequired: true
  });

  assert.deepEqual(gates, {});
});
