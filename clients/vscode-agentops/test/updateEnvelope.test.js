const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildGovernedUpdateEnvelope } = require("../lib/updateEnvelope");

test("buildGovernedUpdateEnvelope packages selected thread review state", () => {
  const envelope = buildGovernedUpdateEnvelope(
    {
      task: { taskId: "task-1", title: "Thread one", status: "IN_PROGRESS" },
      selectedSession: { sessionId: "sess-1", status: "RUNNING" },
      selectedSummary: {
        selectedWorker: { workerId: "worker-1", workerType: "managed_agent", status: "RUNNING" },
        approvals: [{ checkpointId: "appr-1", status: "PENDING" }],
        toolProposals: [{ proposalId: "prop-1", status: "PENDING" }],
        toolActions: [{ toolActionId: "tool-1" }],
        evidenceRecords: [{ evidenceId: "evidence-1" }],
        latestWorkerSummary: "Worker running"
      }
    },
    {
      header: "AgentOps thread update",
      updateType: "review",
      details: ["Selected session: sess-1"],
      actionHints: ["- approvals decide --session-id sess-1 --decision APPROVE|DENY"]
    }
  );
  assert.equal(envelope.header, "AgentOps thread update");
  assert.equal(envelope.updateType, "review");
  assert.equal(envelope.taskId, "task-1");
  assert.equal(envelope.sessionId, "sess-1");
  assert.equal(envelope.openApprovals, 1);
  assert.equal(envelope.pendingProposalCount, 1);
  assert.equal(envelope.summary, "Worker running");
  assert.match(envelope.actionHints[0], /approvals decide/);
});

test("buildGovernedUpdateEnvelope matches shared M19 parity fixture", () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "testdata", "m19-cross-surface-parity.json"), "utf8")
  );
  const envelope = buildGovernedUpdateEnvelope(
    {
      task: fixture.task,
      selectedSession: fixture.session,
      selectedSummary: {
        selectedWorker: fixture.selectedWorker,
        approvals: fixture.pendingApprovals,
        toolProposals: [{ proposalId: "proposal-1", status: "PENDING", summary: fixture.expected.summary }],
        toolActions: [{ toolActionId: "tool-1" }],
        evidenceRecords: fixture.evidenceRecords,
        latestWorkerSummary: fixture.expected.summary
      }
    },
    {
      header: "AgentOps thread update",
      updateType: "review",
      details: ["Selected session: sess-parity-1"],
      recent: fixture.expected.eventLines,
      actionHints: ["- approvals decide --session-id sess-parity-1 --checkpoint-id <id> --decision APPROVE|DENY"]
    }
  );
  assert.equal(envelope.summary, fixture.expected.summary);
  assert.equal(envelope.openApprovals, fixture.expected.approvalIds.length);
  assert.equal(envelope.pendingProposalCount, fixture.expected.proposalIds.length);
  assert.match(envelope.recent.join("\n"), /Worker Progress: Worker collected deployment context\./);
  assert.match(envelope.actionHints.join("\n"), /--checkpoint-id <id>/);
});

test("buildGovernedUpdateEnvelope projects structured org-admin review state", () => {
  const envelope = buildGovernedUpdateEnvelope(
    {
      task: { taskId: "task-org-admin-1", title: "Org Admin Thread", status: "IN_PROGRESS" },
      selectedSession: { sessionId: "sess-org-admin-1", status: "AWAITING_APPROVAL" },
      selectedSummary: {
        selectedWorker: { workerId: "worker-1", workerType: "managed_agent", status: "WAITING" },
        approvals: [
          {
            checkpointId: "checkpoint-org-admin-1",
            status: "PENDING",
            reason: "Delegated admin scope review is required.",
            annotations: {
              orgAdminDecisionBinding: {
                profileId: "centralized_enterprise_admin",
                profileLabel: "Centralized Enterprise Admin",
                organizationModel: "centralized_enterprise",
                bindingId: "centralized_enterprise_admin_delegated_admin_binding",
                bindingLabel: "Centralized Enterprise Admin Delegated Admin Decision Binding",
                category: "delegated_admin",
                selectedRoleBundle: "enterprise.tenant_admin",
                selectedDirectorySyncMappings: ["centralized_enterprise_admin_directory_sync_mapping"],
                selectedExceptionProfiles: ["centralized_enterprise_admin_residency_exception"],
                selectedOverlayProfiles: ["centralized_enterprise_admin_quota_overlay"],
                decisionActorRoles: ["enterprise.tenant_admin"],
                decisionSurfaces: ["policy_pack_assignment"],
                boundaryRequirements: ["runtime_authz"],
                requestedInputKeys: ["idp_group", "tenant_id"],
                inputValues: {
                  idp_group: "grp-agentops-admins",
                  tenant_id: "tenant-a"
                }
              }
            }
          }
        ],
        events: [
          {
            eventId: "event-org-admin-1",
            eventType: "org_admin.directory_sync.requested",
            payload: {
              bindingLabel: "Centralized Enterprise Admin Directory Sync Binding",
              category: "directory_sync",
              selectedDirectorySyncs: ["centralized_enterprise_admin_directory_sync_mapping"],
              status: "PENDING"
            }
          }
        ],
        toolProposals: [],
        toolActions: [],
        evidenceRecords: [
          {
            evidenceId: "evidence-org-admin-1",
            kind: "org_admin_directory_sync_request",
            retentionClass: "standard",
            metadata: {
              bindingLabel: "Centralized Enterprise Admin Directory Sync Binding"
            }
          }
        ],
        latestWorkerSummary: "Awaiting org-admin review"
      }
    },
    {
      header: "AgentOps thread update",
      updateType: "follow"
    }
  );

  assert.equal(envelope.orgAdminProfileId, "centralized_enterprise_admin");
  assert.equal(envelope.orgAdminRoleBundle, "enterprise.tenant_admin");
  assert.equal(envelope.orgAdminPendingReviews, 1);
  assert.match(envelope.orgAdminDecisionBindings.join("\n"), /Centralized Enterprise Admin Delegated Admin Decision Binding/);
  assert.match(envelope.orgAdminInputValues.join("\n"), /tenant_id=tenant-a/);
  assert.match(envelope.orgAdminArtifactEvents.join("\n"), /Directory Sync Review/);
  assert.match(envelope.orgAdminArtifactEvidence.join("\n"), /org_admin_directory_sync_request/);
  assert.match(envelope.orgAdminArtifactRetention.join("\n"), /standard/);
  assert.match(envelope.actionHints.join("\n"), /pending org-admin decision reviews/);
});
