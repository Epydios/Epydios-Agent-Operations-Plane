import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGovernedActionRunPayload,
  evaluateGovernedActionIssues,
  renderGovernedActionReviewSummary
} from "../views/governed-action.js";

test("governed action run payload uses the shared contract on a runtime-compatible request", () => {
  const payload = buildGovernedActionRunPayload(
    {
      tenantId: "tenant-demo",
      projectId: "project-trading",
      environment: "dev",
      demoProfile: "finance_paper_trade",
      requestLabel: "Paper Trade Request: AAPL",
      requestSummary: "BUY 25 AAPL in paper account paper-main",
      subjectId: "alice-trader",
      approvedForProd: false,
      actionType: "trade.execute",
      actionVerb: "execute",
      actionTarget: "paper-broker-order",
      resourceKind: "broker-order",
      resourceNamespace: "epydios-system",
      resourceName: "paper-order-aapl",
      resourceId: "paper-order-aapl",
      boundaryClass: "external_actuator",
      riskTier: "high",
      requiredGrantsText: "grant.trading.supervisor",
      evidenceReadiness: "PARTIAL",
      handshakeRequired: true,
      dryRun: false,
      financeSymbol: "AAPL",
      financeSide: "buy",
      financeQuantity: "25",
      financeAccount: "paper-main"
    },
    {
      claims: {
        sub: "user-demo"
      }
    },
    {
      persona: {
        enabled: true,
        label: "Local Demo Persona",
        subjectId: "demo.operator.local",
        clientId: "desktop-demo-local",
        rolesText: "compliance.viewer"
      },
      policy: {
        enabled: true,
        reviewMode: "policy_first",
        handshakeRequired: true,
        financeSupervisorGrant: true,
        financeEvidenceReadiness: "PARTIAL",
        productionDeleteDeny: true,
        policyBucketPrefix: "desktop-demo"
      }
    }
  );

  assert.equal(payload.meta.actor.type, "operator_ui");
  assert.equal(payload.meta.actor.id, "user-demo");
  assert.equal(payload.context.request.contractId, "epydios.governed-request.v1");
  assert.equal(payload.context.request.originSurface, "home.governed_action_request");
  assert.equal(payload.context.governed_action.request_summary, "BUY 25 AAPL in paper account paper-main");
  assert.equal(payload.context.demo_governance.persona.subjectId, "demo.operator.local");
  assert.equal(payload.context.request.workflowKind, "governed_request");
  assert.equal(payload.task.demoProfile, "finance_paper_trade");
});

test("governed action validation warns when differentiation inputs are weakened", () => {
  const issues = evaluateGovernedActionIssues({
    tenantId: "tenant-demo",
    projectId: "project-trading",
    requestLabel: "Paper Trade Request: AAPL",
    requestSummary: "BUY 25 AAPL in paper account paper-main",
    demoProfile: "finance_paper_trade",
    financeSymbol: "AAPL",
    financeQuantity: "25",
    requiredGrantsText: "",
    evidenceReadiness: "READY",
    handshakeRequired: false,
    riskTier: "low"
  });

  assert.ok(issues.some((issue) => issue.message.includes("No required grants")));
  assert.ok(issues.some((issue) => issue.message.includes("Evidence readiness is READY")));
  assert.ok(issues.some((issue) => issue.message.includes("Handshake enforcement is off")));
  assert.ok(issues.some((issue) => issue.message.includes("Risk tier is not high")));
});

test("governed action review summary colors the stored policy decision", () => {
  const markup = renderGovernedActionReviewSummary({
    runId: "run-allow-001",
    policyDecision: "ALLOW",
    requestPayload: {
      context: {
        governed_action: {
          workflow_kind: "external_action_request",
          demo_profile: "finance_paper_trade"
        }
      }
    }
  });

  assert.match(markup, /chip chip-ok chip-compact">decision=ALLOW/);
  assert.match(markup, /workflow=external_action_request/);
});
