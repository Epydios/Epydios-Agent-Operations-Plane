import test from "node:test";
import assert from "node:assert/strict";
import { renderHomeOpsEmptyState, renderHomeOpsPage } from "../domains/homeops/routes.js";
import { createCompanionProofHandoffContext } from "../domains/homeops/state.js";

test("companionops page renders companion as the daily governance lane with workbench depth handoffs", () => {
  const ui = { homeOpsContent: { innerHTML: "" } };
  renderHomeOpsPage(ui, {
    nativeShell: {
      launcherState: "ready",
      mode: "live",
      runtimeState: "service_running",
      runtimeProcessMode: "background_supervisor",
      bootstrapConfigState: "loaded",
      interposition: {
        enabled: true,
        effective: true,
        status: "on",
        reason: "Interposition is ON. Epydios is governing supported requests."
      },
      runtimeService: {
        state: "running",
        health: "healthy"
      },
      gatewayService: {
        state: "running",
        health: "healthy"
      }
    },
    selectedAgentProfileId: "codex",
    session: {
      authenticated: true,
      claims: {
        sub: "operator@example.com",
        client_id: "epydios-runtime-prod-client",
        tenant_id: "tenant-demo",
        project_id: "project-core",
        roles: ["enterprise.tenant_admin", "ops.operator"]
      }
    },
    health: {
      runtime: { status: "ok", detail: "Runtime API reachable." },
      providers: { status: "warn", detail: "One provider is degraded." }
    },
    pipeline: {
      status: "pass",
      latestProdGate: "prod-full-gate-20260315T164000Z.log"
    },
    providers: {
      items: [
        { providerId: "oss-profile-static", ready: true },
        { providerId: "aimxs-policy-primary", ready: true },
        { providerId: "oss-desktop-openfang-linux", ready: false }
      ]
    },
    settings: {
      identity: {
        authenticated: true,
        authEnabled: true,
        authorityBasis: "runtime_context_identity",
        source: "runtime-endpoint",
        identity: {
          subject: "operator@example.com",
          clientId: "epydios-runtime-prod-client",
          roles: ["enterprise.tenant_admin", "ops.operator"],
          tenantIds: ["tenant-demo"],
          projectIds: ["project-core"],
          effectivePermissions: ["runs.read", "approvals.review", "audit.read"],
          claimKeys: ["sub", "client_id", "tenant_id", "project_id", "roles"]
        }
      },
      aimxs: {
        mode: "aimxs-full",
        activation: {
          selectedProviderId: "aimxs-policy-primary"
        }
      },
      policyCatalog: {
        count: 4,
        items: []
      }
    },
    runs: {
      items: [
        {
          runId: "run-20260315-003",
          status: "FAILED",
          policyDecision: "DENY",
          selectedPolicyProvider: "aimxs-policy-primary",
          updatedAt: "2026-03-15T16:20:00Z",
          evidenceBundleResponse: {
            status: "sealed",
            bundleId: "bundle-20260315-003"
          },
          evidenceRecordResponse: {
            status: "recorded",
            evidenceId: "evidence-20260315-003"
          },
          policyResponse: {
            evidenceRefs: ["evidence://tenant-demo/project-core/run-20260315-003"]
          }
        },
        {
          runId: "run-20260315-002",
          status: "COMPLETED",
          policyDecision: "ALLOW",
          updatedAt: "2026-03-15T16:10:00Z"
        }
      ]
    },
    approvals: {
      source: "runtime-endpoint",
      items: [
        {
          approvalId: "approval-20260315-003",
          status: "PENDING",
          runId: "run-20260315-003",
          expiresAt: "2026-03-15T16:24:00Z"
        },
        {
          approvalId: "approval-20260315-002",
          status: "APPROVED"
        }
      ]
    },
    nativeGatewayHolds: [
      {
        interpositionRequestId: "ixr-20260315-003",
        gatewayRequestId: "gateway-20260315-003",
        runId: "run-20260315-003",
        approvalId: "approval-20260315-003",
        state: "held_pending_approval",
        holdStartedAtUtc: "2026-03-15T16:19:00Z",
        holdDeadlineAtUtc: "2026-03-15T16:24:00Z",
        clientSurface: "codex",
        sourceClient: {
          id: "client-codex",
          name: "Codex"
        },
        tenantId: "tenant-demo",
        projectId: "project-core",
        requestSummary: {
          title: "Restart payments deployment",
          reason: "Policy deferred the request."
        },
        governanceTarget: {
          targetRef: "deploy/payments"
        }
      }
    ],
    nativeApprovalRailItems: [
      {
        selectionId: "native:hold:ixr-20260315-003",
        decisionType: "gateway_hold",
        runId: "run-20260315-003",
        approvalId: "approval-20260315-003",
        clientLabel: "Codex",
        createdAt: "2026-03-15T16:19:00Z",
        expiresAt: "2026-03-15T16:24:00Z",
        status: "PENDING",
        summary: "Restart payments deployment",
        governanceTarget: {
          targetRef: "deploy/payments"
        }
      },
      {
        selectionId: "native:checkpoint:session-1:approval-org-admin-1",
        decisionType: "checkpoint",
        sessionId: "session-1",
        checkpointId: "approval-org-admin-1",
        createdAt: "2026-03-15T16:18:00Z",
        expiresAt: "2026-03-15T16:26:00Z",
        status: "PENDING",
        reason: "Desktop verify needs approval.",
        summary: "Desktop verify needs approval.",
        scope: "org_admin"
      }
    ],
    audit: {
      source: "audit-endpoint",
      items: [
        {
          ts: "2026-03-15T16:21:00Z",
          event: "runtime.policy.decision",
          decision: "DENY"
        },
        {
          ts: "2026-03-15T16:17:00Z",
          event: "approval.reviewed",
          approvalId: "approval-20260315-003",
          runId: "run-20260315-003"
        }
      ]
    },
    incidentHistory: {
      items: [
        {
          id: "incident-entry-20260315-003",
          packageId: "incident-20260315T161900Z-run-20260315-003",
          generatedAt: "2026-03-15T16:19:30Z",
          filingStatus: "filed",
          runId: "run-20260315-003",
          approvalStatus: "PENDING"
        }
      ]
    }
  });

  assert.match(ui.homeOpsContent.innerHTML, /data-domain-root="companionops"/);
  assert.match(ui.homeOpsContent.innerHTML, /Operator Status/);
  assert.match(ui.homeOpsContent.innerHTML, /Needs Attention Now/);
  assert.match(ui.homeOpsContent.innerHTML, /Recent Governed Actions/);
  assert.match(ui.homeOpsContent.innerHTML, /Recent Audit And Event Stream/);
  assert.match(ui.homeOpsContent.innerHTML, /Live Exceptions And Incidents/);
  assert.match(ui.homeOpsContent.innerHTML, /Health And Diagnostics/);
  assert.match(ui.homeOpsContent.innerHTML, /Operator Pivots/);
  assert.match(ui.homeOpsContent.innerHTML, /Connected Client Context/);
  assert.match(ui.homeOpsContent.innerHTML, /Companion/);
  assert.match(ui.homeOpsContent.innerHTML, /Launcher/);
  assert.match(ui.homeOpsContent.innerHTML, /Runtime Service/);
  assert.match(ui.homeOpsContent.innerHTML, /Gateway/);
  assert.match(ui.homeOpsContent.innerHTML, /Default daily lane\. Deep console: AgentOps\./);
  assert.match(ui.homeOpsContent.innerHTML, /Shell: Live desktop path\./);
  assert.match(ui.homeOpsContent.innerHTML, /homeops-feedback ok/);
  assert.match(ui.homeOpsContent.innerHTML, /Interposition is ON\. Companion is the live governance lane for supported requests\./);
  assert.match(ui.homeOpsContent.innerHTML, /Open Workbench Depth/);
  assert.match(ui.homeOpsContent.innerHTML, /Restart Services/);
  assert.match(ui.homeOpsContent.innerHTML, /Show Diagnostics/);
  assert.match(ui.homeOpsContent.innerHTML, /This is the primary governed-request queue/);
  assert.match(ui.homeOpsContent.innerHTML, /Held Request/);
  assert.match(ui.homeOpsContent.innerHTML, /Current Thread Approval/);
  assert.match(ui.homeOpsContent.innerHTML, /Run Attention|Incident/);
  assert.match(ui.homeOpsContent.innerHTML, /Companion stays the daily governed-work lane\./);
  assert.match(ui.homeOpsContent.innerHTML, /Runtime Policy Decision/);
  assert.match(ui.homeOpsContent.innerHTML, /approval reviewed/i);
  assert.match(ui.homeOpsContent.innerHTML, /Open AuditOps Depth/);
  assert.match(ui.homeOpsContent.innerHTML, /incident-20260315T161900Z-run-20260315-003/);
  assert.match(ui.homeOpsContent.innerHTML, /Open Incident Depth/);
  assert.match(ui.homeOpsContent.innerHTML, /Runtime depth/);
  assert.match(ui.homeOpsContent.innerHTML, /Decision \/ Receipt \/ Proof \/ Incident/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-proof-spine/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-proof-anchor="decision"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-proof-anchor="receipt"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-proof-anchor="proof"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-proof-anchor="incident"/);
  assert.match(ui.homeOpsContent.innerHTML, /Decision receipt ready|Approval receipt pending|Receipt continuity attached/);
  assert.match(ui.homeOpsContent.innerHTML, /Incident filed|Incident linked|No incident handoff|Incident attached/);
  assert.match(ui.homeOpsContent.innerHTML, /Proof ready|Proof attached/);
  assert.match(ui.homeOpsContent.innerHTML, /bundle=sealed/);
  assert.match(ui.homeOpsContent.innerHTML, /record=recorded/);
  assert.match(ui.homeOpsContent.innerHTML, /Open Evidence Depth/);
  assert.match(ui.homeOpsContent.innerHTML, /Decision Reason \(Optional\)/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-native-decision-action="APPROVE"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-native-decision-action="DENY"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-native-selection-id="native:hold:ixr-20260315-003"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-native-selection-id="native:checkpoint:session-1:approval-org-admin-1"/);
  assert.match(ui.homeOpsContent.innerHTML, /Review Live Approvals/);
  assert.match(ui.homeOpsContent.innerHTML, /Open Workbench Review/);
  assert.match(ui.homeOpsContent.innerHTML, /Open RuntimeOps Depth/);
  assert.match(ui.homeOpsContent.innerHTML, /operator@example\.com/);
  assert.match(ui.homeOpsContent.innerHTML, /epydios-runtime-prod-client/);
  assert.match(ui.homeOpsContent.innerHTML, /codex/);
  assert.match(ui.homeOpsContent.innerHTML, /tenant-demo\/project-core/);
  assert.match(ui.homeOpsContent.innerHTML, /Open Recent Runs/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-action="open-audit-depth"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-action="open-evidence-item"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-action="open-workbench"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-action="focus-live-approvals"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-action="open-approval-item"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-action="open-run-item"/);
});

test("homeops empty state renders without loaded domain anchors", () => {
  const ui = { homeOpsContent: { innerHTML: "" } };
  renderHomeOpsEmptyState(ui, {
    title: "Companion",
    message: "Companion becomes available after Epydios finishes loading your current workspace."
  });

  assert.match(ui.homeOpsContent.innerHTML, /Companion/);
  assert.match(ui.homeOpsContent.innerHTML, /finishes loading your current workspace/i);
});

test("companion proof handoff context preserves proof, receipt, and incident continuity", () => {
  const handoff = createCompanionProofHandoffContext(
    {
      runs: {
        items: [
          {
            runId: "run-20260327-001",
            evidenceBundleResponse: { status: "sealed", bundleId: "bundle-20260327-001" },
            evidenceRecordResponse: { status: "recorded", evidenceId: "record-20260327-001" },
            policyResponse: {
              evidenceRefs: ["evidence://tenant-demo/project-core/run-20260327-001"]
            }
          }
        ]
      },
      approvals: {
        items: [
          {
            approvalId: "approval-20260327-001",
            runId: "run-20260327-001",
            status: "PENDING"
          }
        ]
      },
      audit: {
        items: [
          {
            event: "approval.reviewed",
            runId: "run-20260327-001",
            approvalId: "approval-20260327-001"
          }
        ]
      },
      incidentHistory: {
        items: [
          {
            id: "incident-entry-20260327-001",
            runId: "run-20260327-001",
            packageId: "incident-20260327T120000Z-run-20260327-001",
            filingStatus: "filed"
          }
        ]
      }
    },
    {
      kind: "evidence",
      view: "evidenceops",
      runId: "run-20260327-001",
      approvalId: "approval-20260327-001",
      openedFrom: "companionops"
    }
  );

  assert.equal(handoff.view, "evidenceops");
  assert.equal(handoff.proof.label, "Proof ready");
  assert.match(handoff.proof.summary, /bundle=sealed/);
  assert.match(handoff.proof.summary, /record=recorded/);
  assert.match(handoff.proof.summary, /incident=incident-20260327T120000Z-run-20260327-001/);
  assert.equal(handoff.receipt.label, "Approval receipt pending");
  assert.equal(handoff.incidentPackageId, "incident-20260327T120000Z-run-20260327-001");
  assert.equal(handoff.auditCount, 1);
  assert.match(handoff.arrivalRationale, /evidence depth/i);
});
