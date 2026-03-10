import test from "node:test";
import assert from "node:assert/strict";
import {
  AIMXS_PROBE_STATE_KEY,
  buildAimxsProbeRequest,
  normalizeAimxsProbeState,
  renderAimxsProbeMetric
} from "../aimxs/probe.js";

test("aimxs probe payload keeps the differential probe shape explicit", () => {
  const payload = buildAimxsProbeRequest({
    tenantId: "tenant-local",
    projectId: "project-local",
    environment: "dev",
    subjectId: "alice",
    actionType: "trade.execute",
    resourceKind: "broker-order",
    resourceName: "order-probe-007",
    boundaryClass: "external_actuator",
    riskTier: "high",
    requiredGrantsText: "grant.trading.supervisor, grant.ops.review",
    evidenceReadiness: "PARTIAL",
    handshakeRequired: true,
    approvedForProd: false,
    dryRun: false
  });

  assert.equal(AIMXS_PROBE_STATE_KEY, "epydios.agentops.desktop.aimxs.probe.v1");
  assert.equal(payload.action.class, "execute");
  assert.equal(payload.context.governed_action.contract_id, "epydios.governed-action.v1");
  assert.equal(payload.context.governed_action.workflow_kind, "external_action_request");
  assert.deepEqual(payload.context.policy_stratification.required_grants, [
    "grant.trading.supervisor",
    "grant.ops.review"
  ]);
  assert.equal(payload.context.policy_stratification.gates["core14.adapter_present.enforce_handshake"], true);
});

test("aimxs probe rendering surfaces stored oss and aimxs differential results", () => {
  const html = renderAimxsProbeMetric(
    normalizeAimxsProbeState({
      draft: {
        tenantId: "tenant-local",
        projectId: "project-local"
      },
      status: "applied",
      message: "Captured probe results.",
      lastResult: {
        mode: "aimxs-full",
        providerId: "aimxs-full",
        decision: "DEFER",
        summary: "aimxs-full returned DEFER.",
        evaluatedAt: "2026-03-09T12:00:00Z",
        differentialSignals: {
          hasDeferCapability: true,
          hasHandshakeCapability: true,
          hasPolicyStratification: true,
          hasEvidenceHash: true,
          evidenceRefsCount: 2,
          baakEngaged: true
        },
        responsePayload: {
          decision: "DEFER"
        }
      },
      resultsByMode: {
        "oss-only": {
          mode: "oss-only",
          providerId: "oss-policy-opa",
          decision: "ALLOW",
          evaluatedAt: "2026-03-09T11:59:00Z",
          differentialSignals: {
            hasDeferCapability: false,
            hasHandshakeCapability: false,
            hasPolicyStratification: false,
            hasEvidenceHash: false,
            evidenceRefsCount: 0
          }
        },
        "aimxs-full": {
          mode: "aimxs-full",
          providerId: "aimxs-full",
          decision: "DEFER",
          evaluatedAt: "2026-03-09T12:00:00Z",
          differentialSignals: {
            hasDeferCapability: true,
            hasHandshakeCapability: true,
            hasPolicyStratification: true,
            hasEvidenceHash: true,
            evidenceRefsCount: 2,
            baakEngaged: true
          }
        }
      }
    }),
    {
      activeMode: "aimxs-full",
      selectedProviderId: "aimxs-full"
    }
  );

  assert.match(html, /AIMXS Richness Self-Check/);
  assert.match(html, /Evaluate Current Mode/);
  assert.match(html, /decisionDifferential=oss-only:ALLOW vs aimxs-full:DEFER/);
  assert.match(html, /policy stratification=oss-only:false vs aimxs-full:true/);
});
