import test from "node:test";
import assert from "node:assert/strict";
import { renderEvidenceOpsEmptyState, renderEvidenceOpsPage } from "../domains/evidenceops/routes.js";
import { createAimxsDecisionBindingSpine } from "../shared/aimxs/decision-binding.js";

test("evidenceops page renders bounded bundle, provenance, and artifact access boards", () => {
  const ui = { evidenceOpsContent: { innerHTML: "" } };
  renderEvidenceOpsPage(ui, {
    settings: {
      storage: {
        retentionDays: {
          auditEvents: 45,
          incidentPackages: 120,
          terminalHistory: 20,
          runSnapshots: 10
        }
      }
    },
    audit: {
      source: "audit-endpoint",
      items: [
        { event: "audit.event.recorded", ts: "2026-03-15T02:00:00Z" },
        { event: "approval.decision.recorded", ts: "2026-03-15T01:59:00Z" }
      ]
    },
    runs: {
      items: [
        {
          runId: "run-20260315-001",
          tenantId: "tenant-demo",
          projectId: "project-core",
          selectedEvidenceProvider: "oss-evidence-memory",
          selectedDesktopProvider: "oss-desktop-openfang-linux",
          selectedPolicyProvider: "aimxs-policy-provider",
          policyDecision: "ALLOW",
          retentionClass: "archive",
          updatedAt: "2026-03-15T02:00:30Z",
          createdAt: "2026-03-15T01:57:00Z",
          requestPayload: {
            context: {
              policy_stratification: {
                boundary_class: "financial_control",
                risk_tier: "high",
                evidence_readiness: "partial",
                required_grants: ["grant.finance.transfer"]
              }
            }
          },
          policyResponse: {
            decision: "ALLOW",
            source: "aimxs-policy-provider",
            evidenceRefs: [
              "evidence://finance/transfer/001",
              "evidence://finance/transfer/002"
            ],
            output: {
              aimxs: {
                providerId: "aimxs-policy-provider",
                providerMeta: {
                  policy_stratification: {
                    boundary_class: "financial_control",
                    risk_tier: "high",
                    evidence_readiness: "partial"
                  }
                }
              }
            }
          },
          evidenceRecordResponse: {
            status: "recorded",
            evidenceId: "evidence-run-001"
          },
          evidenceBundleResponse: {
            status: "finalized",
            bundleId: "bundle-governed-001"
          },
          desktopObserveResponse: {
            verifierId: "V-OBS-001",
            evidenceBundle: {
              screenshotHash: "sha256:observe-001",
              screenshotUri: "file:///tmp/observe-001.png",
              resultCode: "observed",
              windowMetadata: { title: "Sandbox Browser" }
            }
          },
          desktopVerifyResponse: {
            verifierId: "V-VER-001",
            evidenceBundle: {
              screenshotHash: "sha256:verify-001",
              resultCode: "verified",
              windowMetadata: { title: "Sandbox Browser" }
            }
          }
        },
        {
          runId: "run-20260315-002",
          tenantId: "tenant-ops",
          projectId: "project-payments",
          selectedEvidenceProvider: "oss-evidence-memory",
          selectedPolicyProvider: "aimxs-policy-provider",
          policyDecision: "DEFER",
          retentionClass: "standard",
          updatedAt: "2026-03-15T01:51:30Z",
          createdAt: "2026-03-15T01:48:00Z",
          requestPayload: {
            context: {
              policy_stratification: {
                boundary_class: "external_actuator",
                risk_tier: "high",
                evidence_readiness: "ready",
                required_grants: []
              }
            }
          },
          policyResponse: {
            decision: "DEFER",
            source: "aimxs-policy-provider",
            evidenceRefs: ["evidence://payments/settlement/002"]
          },
          evidenceBundleResponse: {
            status: "sealed",
            bundleId: "bundle-governed-002"
          }
        }
      ]
    },
    approvals: {
      items: [
        {
          approvalId: "approval-20260315-001",
          runId: "run-20260315-001",
          status: "APPROVED"
        }
      ]
    },
    adminQueueItems: [
      {
        id: "policy-change-aa10-001",
        ownerDomain: "policyops",
        kind: "policy",
        status: "rolled_back",
        requestedAction: "load read_only_review",
        subjectId: "read_only_review",
        targetScope: "tenant-demo / workspace",
        reason: "Traceability proof.",
        summary: "Load read_only_review for tenant-demo / workspace @ aimxs-policy-provider",
        simulationSummary: "Preview only before live activation.",
        simulatedAt: "2026-03-15T01:58:00Z",
        decision: {
          decisionId: "admin-decision-aa10-002",
          status: "approved",
          approvalReceiptId: "approval-receipt-aa10-002",
          decidedAt: "2026-03-15T01:59:00Z"
        },
        execution: {
          executionId: "admin-execution-aa10-002",
          executedAt: "2026-03-15T02:00:00Z",
          status: "applied"
        },
        receipt: {
          receiptId: "admin-receipt-aa10-002",
          issuedAt: "2026-03-15T02:00:00Z",
          stableRef: "policy-change-aa10-001/admin-receipt-aa10-002"
        },
        rollback: {
          rollbackId: "admin-rollback-aa10-002",
          action: "rollback",
          status: "rolled_back",
          rolledBackAt: "2026-03-15T02:01:00Z",
          stableRef: "policy-change-aa10-001/admin-rollback-aa10-002"
        },
        updatedAt: "2026-03-15T02:01:00Z",
        createdAt: "2026-03-15T01:57:30Z"
      }
    ],
    incidentHistory: {
      items: [
        {
          id: "incident-history-001",
          packageId: "incident-20260315T020100Z-run-20260315-001",
          generatedAt: "2026-03-15T02:01:00Z",
          filingStatus: "filed",
          scope: "tenant-demo/project-core",
          auditSource: "audit-endpoint",
          runId: "run-20260315-001",
          auditMatchedCount: 2,
          fileName: "incident-20260315T020100Z-run-20260315-001.json"
        }
      ]
    },
    thread: {
      taskId: "task-20260315-001",
      tenantId: "tenant-demo",
      projectId: "project-core",
      turns: [
        {
          response: {
            completedAt: "2026-03-15T02:02:00Z"
          },
          sessionView: {
            timeline: {
              session: {
                updatedAt: "2026-03-15T02:02:00Z"
              },
              evidenceRecords: [
                {
                  evidenceId: "evidence-thread-001",
                  sessionId: "session-20260315-001",
                  toolActionId: "tool-20260315-001",
                  tenantId: "tenant-demo",
                  projectId: "project-core",
                  kind: "governed_run",
                  uri: "run://run-20260315-001",
                  retentionClass: "archive",
                  metadata: {
                    runId: "run-20260315-001",
                    policyDecision: "ALLOW",
                    screenshotHash: "sha256:thread-001"
                  }
                }
              ]
            }
          }
        }
      ]
    },
    viewState: {
      feedback: {
        tone: "ok",
        message: "Evidence bundle review JSON downloaded as epydiosops-evidence-bundle-review-bundle-governed-001.json."
      }
    },
    aimxsDecisionBindingSpine: createAimxsDecisionBindingSpine({
      activeDomain: "evidenceops",
      sourceLabel: "correlated run",
      correlationRef: "run-20260315-001",
      runId: "run-20260315-001",
      approvalId: "approval-20260315-001",
      actorRef: "demo.operator",
      subjectRef: "task-20260315-001",
      authorityRef: "codex",
      authorityBasis: "bearer_token_jwt",
      scopeRef: "tenant-demo / project-core",
      providerRef: "aimxs-policy-provider",
      routeRef: "managed_codex_worker",
      boundaryRef: "agentops_gateway",
      grantRef: "policy_grant_token",
      decisionStatus: "ALLOW",
      receiptRef: "approval-receipt-aa10-002",
      stableRef: "policy-change-aa10-001/admin-receipt-aa10-002",
      bundleId: "bundle-governed-001",
      recordId: "evidence-run-001",
      replayRef: "run-20260315-001",
      sessionRef: "session-20260315-001",
      taskRef: "task-20260315-001",
      evidenceRefs: ["evidence://finance/transfer/001", "evidence://finance/transfer/002"],
      auditRefs: ["approval.decision.recorded@2026-03-15T01:59:00Z"],
      summary: "Evidence anchors for the correlated governed run."
    })
  });

  assert.match(ui.evidenceOpsContent.innerHTML, /data-domain-root="evidenceops"/);
  assert.match(ui.evidenceOpsContent.innerHTML, /EvidenceOps Action Complete/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Evidence bundle review JSON downloaded/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Evidence Bundle Board/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Provenance Board/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Admin Change Provenance/);
  assert.match(ui.evidenceOpsContent.innerHTML, /AIMXS Lifecycle Ribbon/);
  assert.match(ui.evidenceOpsContent.innerHTML, /AIMXS Decision-Binding Spine/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Authority Chain/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Grant Chain/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Receipt Chain/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Replay Chain/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Evidence Chain/);
  assert.match(ui.evidenceOpsContent.innerHTML, /data-aimxs-spine-action="open-workspace"/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Decision Binding Contract/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Stable Or Replay Refs/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Evidence Access/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Retention Board/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Evidence To Control Mapping Board/);
  assert.match(ui.evidenceOpsContent.innerHTML, /bundle-governed-001/);
  assert.match(ui.evidenceOpsContent.innerHTML, /approval-20260315-001/);
  assert.match(ui.evidenceOpsContent.innerHTML, /policy-change-aa10-001/);
  assert.match(ui.evidenceOpsContent.innerHTML, /approval-receipt-aa10-002/);
  assert.match(ui.evidenceOpsContent.innerHTML, /admin-receipt-aa10-002/);
  assert.match(ui.evidenceOpsContent.innerHTML, /admin-rollback-aa10-002/);
  assert.match(ui.evidenceOpsContent.innerHTML, /audit-endpoint/);
  assert.match(ui.evidenceOpsContent.innerHTML, /task-20260315-001/);
  assert.match(ui.evidenceOpsContent.innerHTML, /evidence-thread-001/);
  assert.match(ui.evidenceOpsContent.innerHTML, /run-20260315-001/);
  assert.match(ui.evidenceOpsContent.innerHTML, /sha256:thread-001/);
  assert.match(ui.evidenceOpsContent.innerHTML, /run:\/\/run-20260315-001/);
  assert.match(ui.evidenceOpsContent.innerHTML, /incident-20260315T020100Z-run-20260315-001/);
  assert.match(ui.evidenceOpsContent.innerHTML, /incident-20260315T020100Z-run-20260315-001\.json/);
  assert.match(ui.evidenceOpsContent.innerHTML, /tenant-ops\/project-payments/);
  assert.match(ui.evidenceOpsContent.innerHTML, /EPYDIOS_AGENTOPS_DESKTOP_REPO\/provenance\//);
  assert.match(ui.evidenceOpsContent.innerHTML, /\.epydios\/provenance\//);
  assert.match(ui.evidenceOpsContent.innerHTML, /data-evidenceops-action="download-bundle-json"/);
  assert.match(ui.evidenceOpsContent.innerHTML, /data-evidenceops-action="open-bundle-run"/);
  assert.match(ui.evidenceOpsContent.innerHTML, /data-evidenceops-action="open-incidentops"/);
  assert.match(ui.evidenceOpsContent.innerHTML, /data-evidenceops-action="download-provenance-json"/);
  assert.match(ui.evidenceOpsContent.innerHTML, /data-evidenceops-action="open-auditops"/);
  assert.match(ui.evidenceOpsContent.innerHTML, /data-evidenceops-action="copy-latest-uri"/);
  assert.match(ui.evidenceOpsContent.innerHTML, /data-evidenceops-action="copy-suggested-run-folder"/);
  assert.match(ui.evidenceOpsContent.innerHTML, /data-evidenceops-copy-path=/);
  assert.match(ui.evidenceOpsContent.innerHTML, /45d/);
  assert.match(ui.evidenceOpsContent.innerHTML, /120d/);
  assert.match(ui.evidenceOpsContent.innerHTML, /financial_control/);
  assert.match(ui.evidenceOpsContent.innerHTML, /aimxs-policy-provider/);
  assert.match(ui.evidenceOpsContent.innerHTML, /archive/);
  assert.match(ui.evidenceOpsContent.innerHTML, /bundles=2/);
  assert.match(ui.evidenceOpsContent.innerHTML, /sealed=1/);
  assert.match(ui.evidenceOpsContent.innerHTML, /hashes=3/);
  assert.match(ui.evidenceOpsContent.innerHTML, /uris=2/);
});

test("evidenceops empty state renders without loaded proof material", () => {
  const ui = { evidenceOpsContent: { innerHTML: "" } };
  renderEvidenceOpsEmptyState(ui, {
    title: "EvidenceOps",
    message: "Evidence becomes available after recent runs, screenshots, and proof packages load."
  });

  assert.match(ui.evidenceOpsContent.innerHTML, /EvidenceOps/);
  assert.match(ui.evidenceOpsContent.innerHTML, /Evidence becomes available/);
});
