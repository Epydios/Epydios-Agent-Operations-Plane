import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEnterpriseReportEnvelope,
  buildGovernedExportSelectionState,
  prepareGovernedJsonExport,
  prepareGovernedTextExport,
  renderEnterpriseReportEnvelope
} from "../runtime/governance-report.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_PARITY_FIXTURE = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../../../clients/testdata/m20-governed-report-parity.json"),
    "utf8"
  )
);

test("enterprise governance report envelope filters catalogs and redacts secret-like content", () => {
  const envelope = buildEnterpriseReportEnvelope(
    {
      header: "AgentOps enterprise governance report",
      reportType: "review",
      exportProfile: "operator_review",
      audience: "security_review",
      clientSurface: "chat",
      contextLabel: "Thread",
      contextValue: "task-1",
      subjectLabel: "Turn",
      subjectValue: "request-1",
      taskId: "task-1",
      taskStatus: "RUNNING",
      sessionId: "sess-1",
      sessionStatus: "RUNNING",
      workerId: "worker-1",
      workerType: "managed_agent",
      workerAdapterId: "codex",
      workerState: "RUNNING",
      executionMode: "managed_codex_worker",
      approvalCheckpoints: [
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
              decisionActorRoles: ["enterprise.tenant_admin"],
              decisionSurfaces: ["policy_pack_assignment"],
              boundaryRequirements: ["runtime_authz"]
            }
          }
        }
      ],
      summary: "Bearer sk-abc1234567890123456789 must be removed",
      details: ["Endpoint ref: ref://gateways/litellm/openai-compatible"]
    },
    {
      items: [
        {
          packId: "enterprise-default",
          label: "Enterprise Default",
          clientSurfaces: ["chat"],
          applicableExecutionModes: ["managed_codex_worker"],
          applicableWorkerTypes: ["managed_agent"],
          applicableAdapterIDs: ["codex"],
          roleBundles: ["operator", "approver"],
          decisionSurfaces: ["approval", "tool_proposal"],
          reportingSurfaces: ["report", "json_export"],
          boundaryRequirements: ["agentops_gateway"]
        }
      ]
    },
    {
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
    {},
    {
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
          clientSurfaces: ["chat"]
        }
      ]
    }
  );

  assert.equal(envelope.exportProfile, "operator_review");
  assert.equal(envelope.audience, "security_review");
  assert.equal(envelope.retentionClass, "archive");
  assert.equal(envelope.applicablePolicyPacks[0], "enterprise-default: Enterprise Default");
  assert.equal(envelope.exportProfileLabels[0], "operator_review: Operator Review");
  assert.ok(envelope.allowedAudiences.includes("security_review"));
  assert.ok(envelope.allowedRetentionClasses.includes("archive"));
  assert.ok(envelope.retentionOverlays.includes("security_review => archive"));
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
  assert.match(envelope.workerCapabilityLabels[0], /Managed Codex Worker/);
  assert.match(envelope.summary, /\[REDACTED\]/);
  assert.ok(envelope.redactionCount > 0);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Audience: security_review/);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Applicable org-admin profiles:/);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Decision binding coverage:/);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Enforcement profile coverage:/);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Directory-sync mapping coverage:/);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Exception profile coverage:/);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Overlay profile coverage:/);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Active org-admin categories:/);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Active org-admin decision actor roles:/);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Active org-admin decision surfaces:/);
  assert.match(renderEnterpriseReportEnvelope(envelope), /Active org-admin boundary requirements:/);
});

test("governed json export redacts structured secret-like content and carries export metadata", () => {
  const prepared = prepareGovernedJsonExport(
    {
      transcript: {
        token: "Bearer sk-abc1234567890123456789"
      }
    },
    {
      exportProfile: "external_report",
      audience: "exec_review"
    }
  );

  assert.equal(prepared.exportProfile, "external_report");
  assert.equal(prepared.audience, "exec_review");
  assert.equal(prepared.retentionClass, "archive");
  assert.match(prepared.serialized, /\[REDACTED\]/);
  assert.ok(prepared.redactionCount > 0);
});

test("governed export carries active org-admin review metadata when approval checkpoints are provided", () => {
  const prepared = prepareGovernedJsonExport(
    {
      transcript: {
        token: "Bearer sk-abc1234567890123456789"
      }
    },
    {
      exportProfile: "external_report",
      audience: "exec_review",
      approvalCheckpoints: [
        {
          checkpointId: "approval-org-admin-export-1",
          status: "PENDING",
          reason: "Delegated admin review required before export.",
          annotations: {
            orgAdminDecisionBinding: {
              profileId: "centralized_enterprise_admin",
              organizationModel: "centralized_enterprise",
              bindingId: "centralized_enterprise_admin_delegated_admin_binding",
              bindingLabel: "Centralized Enterprise Admin Delegated Admin Decision Binding",
              category: "delegated_admin",
              bindingMode: "delegated_admin_scope_review",
              selectedRoleBundle: "enterprise.tenant_admin",
              requestedInputKeys: ["idp_group", "tenant_id"],
              inputValues: {
                idp_group: "grp-agentops-tenant-admins",
                tenant_id: "tenant-a"
              },
              decisionActorRoles: ["enterprise.tenant_admin"],
              decisionSurfaces: ["policy_pack_assignment"],
              boundaryRequirements: ["runtime_authz"]
            }
          }
        }
      ]
    }
  );

  assert.equal(prepared.activeOrgAdminProfileId, "centralized_enterprise_admin");
  assert.equal(prepared.activeOrgAdminOrganizationModel, "centralized_enterprise");
  assert.equal(prepared.activeOrgAdminRoleBundle, "enterprise.tenant_admin");
  assert.equal(prepared.activeOrgAdminPendingReviews, 1);
  assert.deepEqual(prepared.activeOrgAdminCategories, ["delegated_admin"]);
  assert.ok(prepared.activeOrgAdminDecisionBindings.some((item) => item.includes("Delegated Admin Decision Binding")));
  assert.deepEqual(prepared.activeOrgAdminDecisionActorRoles, ["enterprise.tenant_admin"]);
  assert.deepEqual(prepared.activeOrgAdminDecisionSurfaces, ["policy_pack_assignment"]);
  assert.deepEqual(prepared.activeOrgAdminBoundaryRequirements, ["runtime_authz"]);
  assert.deepEqual(prepared.activeOrgAdminInputKeys, ["idp_group", "tenant_id"]);
  assert.ok(prepared.activeOrgAdminDetails.some((item) => item.includes("Org-admin decision binding:")));
  assert.ok(prepared.activeOrgAdminActionHints.some((item) => item.includes("pending org-admin decision reviews")));
});

test("enterprise report and governed export infer normalized profile and audience from surface plus report type", () => {
  const envelope = buildEnterpriseReportEnvelope(
    {
      reportType: "delta-report",
      clientSurface: "workflow",
      contextValue: "jira | WF-1",
      subjectValue: "OPS-101"
    },
    {},
    {}
  );
  assert.equal(envelope.exportProfile, "workflow_follow");
  assert.equal(envelope.audience, "workflow_operator");

  const prepared = prepareGovernedJsonExport(
    { note: "ok" },
    {
      clientSurface: "chatops",
      reportType: "delta-report"
    }
  );
  assert.equal(prepared.exportProfile, "conversation_follow");
  assert.equal(prepared.audience, "conversation_operator");
  assert.equal(prepared.clientSurface, "chatops");
  assert.equal(prepared.reportType, "delta-report");
});

test("desktop audit export carries governed export metadata and redacts structured secret-like content", () => {
  const prepared = prepareGovernedJsonExport(
    {
      rows: [
        {
          eventId: "audit-1",
          note: "Bearer sk-abc1234567890123456789 should be removed"
        }
      ]
    },
    {
      clientSurface: "desktop",
      reportType: "export",
      exportProfile: "audit_export",
      audience: "downstream_review"
    }
  );

  assert.equal(prepared.exportProfile, "audit_export");
  assert.equal(prepared.audience, "downstream_review");
  assert.equal(prepared.retentionClass, "standard");
  assert.ok(prepared.exportProfileLabels.includes("audit_export: Audit Export"));
  assert.ok(prepared.allowedAudiences.includes("compliance_review"));
  assert.ok(prepared.allowedRetentionClasses.includes("archive"));
  assert.ok(prepared.deliveryChannels.includes("download"));
  assert.ok(prepared.redactionModes.includes("structured_and_text"));
  assert.match(prepared.serialized, /\[REDACTED\]/);
  assert.ok(prepared.redactionCount > 0);
});

test("desktop incident handoff carries governed export metadata and redacts text output", () => {
  const prepared = prepareGovernedTextExport(
    "Incident handoff with Bearer sk-abc1234567890123456789 must be removed",
    {
      clientSurface: "desktop",
      reportType: "handoff",
      exportProfile: "incident_handoff",
      audience: "incident_response"
    }
  );

  assert.equal(prepared.exportProfile, "incident_handoff");
  assert.equal(prepared.audience, "incident_response");
  assert.equal(prepared.retentionClass, "standard");
  assert.ok(prepared.exportProfileLabels.includes("incident_handoff: Incident Handoff"));
  assert.ok(prepared.allowedAudiences.includes("security_review"));
  assert.ok(prepared.allowedRetentionClasses.includes("short"));
  assert.ok(prepared.deliveryChannels.includes("copy"));
  assert.ok(prepared.redactionModes.includes("text"));
  assert.match(prepared.text, /\[REDACTED\]/);
  assert.ok(prepared.redactionCount > 0);
});

test("buildGovernedExportSelectionState normalizes chat export selection from the runtime catalog", () => {
  const selection = buildGovernedExportSelectionState({
    clientSurface: "chat",
    reportType: "review",
    exportProfileCatalog: {
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
          clientSurfaces: ["chat"],
          deliveryChannels: ["copy", "report"],
          redactionMode: "structured_and_text"
        }
      ]
    },
    exportProfile: "operator_review",
    audience: "security_review"
  });

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

test("shared governed report parity fixture keeps chat export metadata and redaction aligned", () => {
  const fixtureCase = REPORT_PARITY_FIXTURE.cases.find((item) => item.id === "chat_review");
  assert.ok(fixtureCase, "missing chat_review parity fixture");
  const envelope = buildEnterpriseReportEnvelope(
    fixtureCase.subject,
    {},
    {},
    REPORT_PARITY_FIXTURE.exportProfiles,
    REPORT_PARITY_FIXTURE.orgAdminProfiles
  );
  assert.equal(envelope.exportProfile, fixtureCase.expect.exportProfile);
  assert.equal(envelope.audience, fixtureCase.expect.audience);
  assert.equal(envelope.retentionClass, fixtureCase.expect.retentionClass);
  assert.ok(envelope.applicableOrgAdmins.length > 0);
  assert.ok(envelope.directorySyncMappings.length > 0);
  assert.ok(envelope.exceptionProfileLabels.length > 0);
  assert.ok(envelope.overlayProfileLabels.length > 0);
  assert.equal(envelope.clientSurface, fixtureCase.expect.clientSurface);
  assert.ok(envelope.redactionCount >= fixtureCase.expect.redactionCountMin);
  const rendered = renderEnterpriseReportEnvelope(envelope);
  assert.doesNotMatch(rendered, /sk-abc1234567890123456789/);
  assert.match(rendered, /DLP findings:/);
  assert.match(rendered, /Overlay profile coverage:/);
});

test("chat tool-action review export preserves governed export metadata and redaction", () => {
  const prepared = prepareGovernedJsonExport(
    {
      toolActionId: "tool-1",
      payload: {
        command: "echo Bearer sk-abc1234567890123456789"
      }
    },
    {
      clientSurface: "chat",
      reportType: "review",
      exportProfile: "operator_review",
      audience: "security_review",
      exportProfileCatalog: REPORT_PARITY_FIXTURE.exportProfiles,
      orgAdminCatalog: REPORT_PARITY_FIXTURE.orgAdminProfiles
    }
  );
  assert.equal(prepared.exportProfile, "operator_review");
  assert.equal(prepared.audience, "security_review");
  assert.equal(prepared.retentionClass, "archive");
  assert.ok(prepared.directorySyncMappings.length > 0);
  assert.ok(prepared.exceptionProfileLabels.length > 0);
  assert.ok(prepared.overlayProfileLabels.length > 0);
  assert.match(prepared.serialized, /\[REDACTED\]/);
  assert.ok(prepared.redactionCount > 0);
});

test("chat evidence review export preserves governed export metadata and redaction", () => {
  const prepared = prepareGovernedJsonExport(
    {
      evidenceId: "evidence-1",
      metadata: {
        preview: "Bearer sk-abc1234567890123456789"
      }
    },
    {
      clientSurface: "chat",
      reportType: "review",
      exportProfile: "operator_review",
      audience: "security_review",
      exportProfileCatalog: REPORT_PARITY_FIXTURE.exportProfiles,
      orgAdminCatalog: REPORT_PARITY_FIXTURE.orgAdminProfiles
    }
  );
  assert.equal(prepared.exportProfile, "operator_review");
  assert.equal(prepared.audience, "security_review");
  assert.equal(prepared.retentionClass, "archive");
  assert.ok(prepared.overlayProfileLabels.length > 0);
  assert.match(prepared.serialized, /\[REDACTED\]/);
  assert.ok(prepared.redactionCount > 0);
});

test("chat governance report export preserves governed export metadata and redaction", () => {
  const prepared = prepareGovernedTextExport(
    "Governed report includes Bearer sk-abc1234567890123456789 and must be sanitized before download.",
    {
      clientSurface: "chat",
      reportType: "review",
      exportProfile: "operator_review",
      audience: "security_review",
      exportProfileCatalog: REPORT_PARITY_FIXTURE.exportProfiles,
      orgAdminCatalog: REPORT_PARITY_FIXTURE.orgAdminProfiles
    }
  );
  assert.equal(prepared.exportProfile, "operator_review");
  assert.equal(prepared.audience, "security_review");
  assert.equal(prepared.retentionClass, "archive");
  assert.ok(prepared.exceptionProfileLabels.length > 0);
  assert.match(prepared.text, /\[REDACTED\]/);
  assert.ok(prepared.redactionCount > 0);
});
