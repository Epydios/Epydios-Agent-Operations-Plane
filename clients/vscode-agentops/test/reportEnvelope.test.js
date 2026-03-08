const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildGovernedReportEnvelope, buildGovernedReportSelectionState } = require("../lib/reportEnvelope");

const REPORT_PARITY_FIXTURE = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../testdata/m20-governed-report-parity.json"),
    "utf8"
  )
);

test("buildGovernedReportEnvelope filters catalogs and redacts secret-like content", () => {
  const envelope = buildGovernedReportEnvelope(
    {
      task: { taskId: "task-1", status: "RUNNING" },
      selectedSession: { sessionId: "sess-1", status: "RUNNING" },
      selectedSummary: {
        executionMode: "managed_codex_worker",
        selectedWorker: {
          workerId: "worker-1",
          workerType: "managed_agent",
          adapterId: "codex",
          status: "RUNNING"
        },
        approvals: [
          {
            checkpointId: "approval-org-admin-1",
            status: "PENDING",
            reason: "Delegated admin scope review is required before rollout.",
            annotations: {
              orgAdminDecisionBinding: {
                profileId: "centralized_enterprise_admin",
                profileLabel: "Centralized Enterprise Admin",
                organizationModel: "centralized_enterprise",
                bindingId: "centralized_enterprise_admin_delegated_admin_binding",
                bindingLabel: "Centralized Enterprise Admin Delegated Admin Decision Binding",
                category: "delegated_admin",
                bindingMode: "delegated_admin_scope_review",
                selectedRoleBundle: "enterprise.tenant_admin",
                selectedDirectorySyncMappings: ["centralized_enterprise_admin_directory_sync_mapping"],
                selectedExceptionProfiles: ["centralized_enterprise_admin_residency_exception"],
                selectedOverlayProfiles: ["centralized_enterprise_admin_quota_overlay"],
                requiredInputs: ["idp_group", "tenant_id"],
                requestedInputKeys: ["idp_group", "tenant_id"],
                inputValues: {
                  idp_group: "grp-agentops-tenant-admins",
                  tenant_id: "tenant-a",
                  cost_center: "CC-20410",
                  environment: "prod",
                  business_unit: "platform"
                },
                decisionSurfaces: ["policy_pack_assignment"],
                boundaryRequirements: ["runtime_authz"]
              }
            }
          }
        ],
        toolProposals: [{ proposalId: "prop-1", status: "PENDING" }],
        toolActions: [{ toolActionId: "tool-1" }],
        evidenceRecords: [{ evidenceId: "evidence-1" }],
        latestWorkerSummary: "Bearer sk-abc1234567890123456789 should be removed"
      },
      catalogs: {}
    },
    {
      policyPacks: {
        items: [
          {
            packId: "enterprise-default",
            label: "Enterprise Default",
            clientSurfaces: ["vscode"],
            applicableExecutionModes: ["managed_codex_worker"],
            applicableWorkerTypes: ["managed_agent"],
            applicableAdapterIDs: ["codex"],
            roleBundles: ["operator", "approver"],
            decisionSurfaces: ["approval", "tool_proposal"],
            reportingSurfaces: ["report", "clipboard"],
            boundaryRequirements: ["agentops_gateway"]
          }
        ]
      },
      workerCapabilities: {
        items: [
          {
            executionMode: "managed_codex_worker",
            workerType: "managed_agent",
            adapterId: "codex",
            label: "Managed Codex Worker",
            provider: "agentops_gateway",
            transport: "responses_api",
            model: "gpt-5-codex",
            boundaryRequirements: ["agentops_gateway"]
          }
        ]
      },
      orgAdminProfiles: {
        items: [
          {
            profileId: "centralized_enterprise_admin",
            label: "Centralized Enterprise Admin",
            organizationModel: "centralized_enterprise",
            adminRoleBundles: ["enterprise.org_admin"],
            delegatedAdminRoleBundles: ["enterprise.tenant_admin"],
            breakGlassRoleBundles: ["enterprise.break_glass_admin"],
            enforcementProfiles: [
              {
                hookId: "delegated_admin_scope_guard",
                label: "Delegated Admin Scope Guard",
                category: "delegated_admin",
                enforcementMode: "scope_guard",
                roleBundles: ["enterprise.tenant_admin"],
                requiredInputs: ["idp_group", "tenant_id"]
              }
            ],
            directorySyncMappings: [
              {
                mappingId: "centralized_enterprise_admin_directory_sync_mapping",
                label: "Centralized Enterprise Admin Directory Sync Mapping",
                mappingMode: "group_to_role_binding",
                requiredInputs: ["idp_group", "tenant_id"],
                scopeDimensions: ["tenant_id"]
              }
            ],
            decisionBindings: [
              {
                bindingId: "centralized_enterprise_admin_delegated_admin_binding",
                label: "Centralized Enterprise Admin Delegated Admin Decision Binding",
                category: "delegated_admin",
                bindingMode: "delegated_admin_scope_review",
                hookIds: ["delegated_admin_scope_guard"],
                directorySyncMappings: ["centralized_enterprise_admin_directory_sync_mapping"],
                roleBundles: ["enterprise.tenant_admin"],
                requiredInputs: ["idp_group", "tenant_id"],
                decisionSurfaces: ["policy_pack_assignment"],
                boundaryRequirements: ["runtime_authz"]
              }
            ],
            directorySyncInputs: ["idp_group", "tenant_id"],
            residencyProfiles: ["single_region_tenant_pinning"],
            exceptionProfiles: [
              {
                profileId: "centralized_enterprise_admin_residency_exception",
                label: "Centralized Enterprise Admin Residency Exception",
                category: "residency",
                exceptionMode: "ticketed_exception_review",
                requiredInputs: ["residency_exception_ticket"]
              }
            ],
            residencyExceptionInputs: ["residency_exception_ticket"],
            legalHoldProfiles: ["litigation_hold"],
            legalHoldExceptionInputs: ["legal_hold_case_id"],
            networkBoundaryProfiles: ["enterprise_proxy_required"],
            fleetRolloutProfiles: ["mdm_managed_desktop_ring"],
            overlayProfiles: [
              {
                overlayId: "centralized_enterprise_admin_quota_overlay",
                label: "Centralized Enterprise Admin Quota Overlay",
                category: "quota",
                overlayMode: "quota_override_review",
                targetDimensions: ["organization", "tenant"],
                requiredInputs: ["tenant_id"]
              }
            ],
            quotaDimensions: ["organization", "tenant"],
            quotaOverlayInputs: ["tenant_id"],
            chargebackDimensions: ["cost_center"],
            chargebackOverlayInputs: ["cost_center"],
            enforcementHooks: ["delegated_admin_scope_guard"],
            boundaryRequirements: ["runtime_authz"],
            reportingSurfaces: ["admin_report"],
            clientSurfaces: ["vscode"]
          }
        ]
      }
    },
    {
      details: ["Selected session: sess-1"],
      recent: ["Worker Progress: Worker resumed after governed tool execution."],
      actionHints: ["Resolve the pending approval before external handoff."]
    }
  );

  assert.equal(envelope.exportProfile, "operator_review");
  assert.equal(envelope.audience, "operator");
  assert.equal(envelope.retentionClass, "standard");
  assert.ok(envelope.exportProfileLabels.includes("operator_review: Operator Review"));
  assert.ok(envelope.allowedAudiences.includes("security_review"));
  assert.ok(envelope.allowedRetentionClasses.includes("archive"));
  assert.ok(envelope.deliveryChannels.includes("copy"));
  assert.ok(envelope.applicableOrgAdmins.includes("centralized_enterprise_admin: Centralized Enterprise Admin"));
  assert.ok(envelope.adminRoleBundles.includes("enterprise.org_admin"));
  assert.ok(envelope.enforcementHooks.includes("delegated_admin_scope_guard"));
  assert.ok(envelope.decisionBindingLabels.some((item) => item.includes("Delegated Admin Decision Binding")));
  assert.ok(envelope.enforcementProfileLabels.some((item) => item.includes("Delegated Admin Scope Guard")));
  assert.ok(envelope.directorySyncMappings.some((item) => item.includes("Directory Sync Mapping")));
  assert.ok(envelope.exceptionProfileLabels.some((item) => item.includes("Residency Exception")));
  assert.ok(envelope.overlayProfileLabels.some((item) => item.includes("Quota Overlay")));
  assert.ok(envelope.details.some((item) => item.includes("Org-admin decision binding:")));
  assert.ok(envelope.details.some((item) => item.includes("Org-admin input values:")));
  assert.ok(envelope.actionHints.some((item) => item.includes("pending org-admin decision reviews")));
  assert.equal(envelope.applicablePolicyPacks[0], "enterprise-default: Enterprise Default");
  assert.match(envelope.workerCapabilityLabels[0], /Managed Codex Worker/);
  assert.match(envelope.summary, /\[REDACTED\]/);
  assert.ok(envelope.redactionCount > 0);
  assert.match(envelope.renderedText, /Audience: operator/);
  assert.match(envelope.renderedText, /Applicable org-admin profiles:/);
  assert.match(envelope.renderedText, /Decision binding coverage:/);
  assert.match(envelope.renderedText, /Enforcement profile coverage:/);
  assert.match(envelope.renderedText, /Directory-sync mapping coverage:/);
  assert.match(envelope.renderedText, /Exception profile coverage:/);
  assert.match(envelope.renderedText, /Overlay profile coverage:/);
});

test("buildGovernedReportEnvelope infers normalized report disposition", () => {
  const envelope = buildGovernedReportEnvelope(
    {
      task: { taskId: "task-2", status: "RUNNING" },
      selectedSession: { sessionId: "sess-2", status: "RUNNING" },
      selectedSummary: {}
    },
    {},
    {
      clientSurface: "chatops",
      reportType: "delta-report"
    }
  );
  assert.equal(envelope.exportProfile, "conversation_follow");
  assert.equal(envelope.audience, "conversation_operator");
  assert.equal(envelope.retentionClass, "short");
  assert.ok(envelope.exportProfileLabels.includes("conversation_follow: Conversation Follow"));
  assert.ok(envelope.deliveryChannels.includes("thread_reply"));
  assert.match(envelope.renderedText, /Export profile: conversation_follow/);
});

test("buildGovernedReportSelectionState normalizes export profile, audience, and retention from catalog rules", () => {
  const selection = buildGovernedReportSelectionState(
    {
      exportProfiles: {
        items: [
          {
            exportProfile: "operator_review",
            label: "Operator Review",
            reportTypes: ["review"],
            defaultAudience: "operator",
            allowedAudiences: ["operator", "security_review"],
            defaultRetentionClass: "standard",
            allowedRetentionClasses: ["standard", "archive"],
            audienceRetentionClassOverlays: { security_review: "archive" },
            clientSurfaces: ["vscode"],
            deliveryChannels: ["copy", "report"],
            redactionMode: "structured_and_text"
          }
        ]
      }
    },
    {
      clientSurface: "vscode",
      reportType: "review",
      exportProfile: "operator_review",
      audience: "security_review"
    }
  );

  assert.equal(selection.exportProfile, "operator_review");
  assert.equal(selection.audience, "security_review");
  assert.equal(selection.retentionClass, "archive");
  assert.deepEqual(selection.exportProfileOptions, [
    { value: "operator_review", label: "Operator Review" }
  ]);
  assert.deepEqual(selection.audienceOptions, ["operator", "security_review"]);
  assert.ok(selection.retentionClassOptions.includes("archive"));
  assert.ok(selection.retentionOverlays.includes("security_review => archive"));
});

test("shared governed report parity fixture keeps VS Code export metadata and redaction aligned", () => {
  const fixtureCase = REPORT_PARITY_FIXTURE.cases.find((item) => item.id === "vscode_review");
  assert.ok(fixtureCase, "missing vscode_review parity fixture");
  const envelope = buildGovernedReportEnvelope(
    {
      task: { taskId: fixtureCase.subject.taskId, status: fixtureCase.subject.taskStatus },
      selectedSession: { sessionId: fixtureCase.subject.sessionId, status: fixtureCase.subject.sessionStatus },
      selectedSummary: {
        executionMode: fixtureCase.subject.executionMode,
        selectedWorker: {
          workerId: fixtureCase.subject.workerId,
          workerType: fixtureCase.subject.workerType,
          adapterId: fixtureCase.subject.workerAdapterId,
          status: fixtureCase.subject.workerState
        },
        latestWorkerSummary: fixtureCase.subject.summary
      }
    },
    {
      exportProfiles: REPORT_PARITY_FIXTURE.exportProfiles,
      orgAdminProfiles: REPORT_PARITY_FIXTURE.orgAdminProfiles
    },
    {
      clientSurface: fixtureCase.subject.clientSurface,
      reportType: fixtureCase.subject.reportType,
      exportProfile: fixtureCase.subject.exportProfile,
      audience: fixtureCase.subject.audience,
      details: fixtureCase.subject.details,
      recent: fixtureCase.subject.recent,
      actionHints: fixtureCase.subject.actionHints
    }
  );
  assert.equal(envelope.exportProfile, fixtureCase.expect.exportProfile);
  assert.equal(envelope.audience, fixtureCase.expect.audience);
  assert.equal(envelope.retentionClass, fixtureCase.expect.retentionClass);
  assert.equal(envelope.clientSurface, fixtureCase.expect.clientSurface);
  assert.ok(envelope.applicableOrgAdmins.length > 0);
  assert.ok(envelope.directorySyncMappings.length > 0);
  assert.ok(envelope.exceptionProfileLabels.length > 0);
  assert.ok(envelope.overlayProfileLabels.length > 0);
  assert.ok(envelope.redactionCount >= fixtureCase.expect.redactionCountMin);
  assert.doesNotMatch(envelope.renderedText, /sk-abc1234567890123456789/);
  assert.match(envelope.renderedText, /DLP findings:/);
  assert.match(envelope.renderedText, /Overlay profile coverage:/);
});
