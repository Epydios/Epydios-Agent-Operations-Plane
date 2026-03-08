import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDesktopGovernedExportOptions,
  describeGovernedExportDisposition,
  describeGovernedExportRedactions
} from "../runtime/desktop-export-governance.js";
import { prepareGovernedJsonExport, prepareGovernedTextExport } from "../runtime/governance-report.js";

const EXPORT_PROFILE_CATALOG = {
  items: [
    {
      exportProfile: "audit_export",
      label: "Audit Export",
      reportTypes: ["export", "handoff"],
      defaultAudience: "downstream_review",
      allowedAudiences: ["downstream_review", "security_review", "compliance_review"],
      defaultRetentionClass: "archive",
      allowedRetentionClasses: ["standard", "archive"],
      audienceRetentionClassOverlays: {
        downstream_review: "standard",
        security_review: "archive",
        compliance_review: "archive"
      },
      clientSurfaces: ["desktop"],
      deliveryChannels: ["download", "copy", "preview"],
      redactionMode: "structured_and_text"
    },
    {
      exportProfile: "audit_handoff",
      label: "Audit Handoff",
      reportTypes: ["handoff"],
      defaultAudience: "downstream_review",
      allowedAudiences: ["downstream_review", "security_review"],
      defaultRetentionClass: "short",
      allowedRetentionClasses: ["short", "standard"],
      audienceRetentionClassOverlays: { security_review: "standard" },
      clientSurfaces: ["desktop"],
      deliveryChannels: ["copy", "preview"],
      redactionMode: "text"
    },
    {
      exportProfile: "incident_export",
      label: "Incident Export",
      reportTypes: ["export", "handoff"],
      defaultAudience: "incident_response",
      allowedAudiences: ["incident_response", "security_review", "executive_incident_review"],
      defaultRetentionClass: "archive",
      allowedRetentionClasses: ["standard", "archive"],
      audienceRetentionClassOverlays: {
        incident_response: "standard",
        security_review: "archive",
        executive_incident_review: "archive"
      },
      clientSurfaces: ["desktop"],
      deliveryChannels: ["download", "copy", "preview"],
      redactionMode: "structured_and_text"
    },
    {
      exportProfile: "incident_handoff",
      label: "Incident Handoff",
      reportTypes: ["handoff"],
      defaultAudience: "incident_response",
      allowedAudiences: ["incident_response", "security_review"],
      defaultRetentionClass: "standard",
      allowedRetentionClasses: ["short", "standard"],
      audienceRetentionClassOverlays: { security_review: "standard" },
      clientSurfaces: ["desktop"],
      deliveryChannels: ["copy", "preview"],
      redactionMode: "text"
    }
  ]
};

const ORG_ADMIN_CATALOG = {
  items: [
    {
      profileId: "centralized_enterprise_admin",
      label: "Centralized Enterprise Admin",
      clientSurfaces: ["desktop"],
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
      exceptionProfiles: [
        {
          profileId: "centralized_enterprise_admin_residency_exception",
          label: "Centralized Enterprise Admin Residency Exception",
          category: "residency",
          exceptionMode: "ticketed_exception_review",
          requiredInputs: ["residency_exception_ticket"]
        }
      ],
      overlayProfiles: [
        {
          overlayId: "centralized_enterprise_admin_quota_overlay",
          label: "Centralized Enterprise Admin Quota Overlay",
          category: "quota",
          overlayMode: "quota_override_review",
          targetDimensions: ["organization", "tenant"],
          requiredInputs: ["tenant_id"]
        }
      ]
    }
  ]
};

test("desktop audit export options normalize retention from the governed export catalog", () => {
  const options = buildDesktopGovernedExportOptions(
    "audit_export",
    "downstream_review",
    "export",
    "desktop",
    EXPORT_PROFILE_CATALOG,
    ""
  );

  assert.equal(options.exportProfile, "audit_export");
  assert.equal(options.audience, "downstream_review");
  assert.equal(options.retentionClass, "standard");
  assert.equal(options.clientSurface, "desktop");
  assert.equal(options.reportType, "export");
});

test("desktop incident handoff options preserve explicit compliant retention selections", () => {
  const options = buildDesktopGovernedExportOptions(
    "incident_handoff",
    "incident_response",
    "handoff",
    "desktop",
    EXPORT_PROFILE_CATALOG,
    "short"
  );

  assert.equal(options.exportProfile, "incident_handoff");
  assert.equal(options.audience, "incident_response");
  assert.equal(options.retentionClass, "short");
});

test("governed export disposition text carries profile audience and retention", () => {
  const description = describeGovernedExportDisposition({
    exportProfile: "incident_export",
    audience: "security_review",
    retentionClass: "archive",
    orgAdminOrganizationModels: ["centralized_enterprise"],
    orgAdminRoleBundles: ["enterprise.tenant_admin"],
    orgAdminDecisionActorRoles: ["enterprise.tenant_admin"],
    orgAdminInputValues: ["tenant_id=tenant-a"],
    decisionBindingLabels: ["Centralized Enterprise Admin Delegated Admin Decision Binding"],
    directorySyncMappings: ["Centralized Enterprise Admin Directory Sync Mapping"],
    exceptionProfileLabels: ["Centralized Enterprise Admin Residency Exception"],
    overlayProfileLabels: ["Centralized Enterprise Admin Quota Overlay"]
  });

  assert.match(description, /profile=incident_export/);
  assert.match(description, /audience=security_review/);
  assert.match(description, /retention=archive/);
  assert.match(description, /decisionBindings=1/);
  assert.match(description, /directoryMappings=1/);
  assert.match(description, /exceptionProfiles=1/);
  assert.match(description, /overlayProfiles=1/);
  assert.match(description, /organizationModels=1/);
  assert.match(description, /roleBundles=1/);
  assert.match(description, /decisionActorRoles=1/);
  assert.match(description, /inputValues=1/);
});

test("governed export redaction description is empty when nothing was redacted", () => {
  assert.equal(describeGovernedExportRedactions({ redactionCount: 0 }, "incident export"), "");
  assert.match(
    describeGovernedExportRedactions({ redactionCount: 3 }, "incident export"),
    /DLP redactions=3/
  );
});

test("desktop audit export action preserves governed disposition and structured redaction", () => {
  const prepared = prepareGovernedJsonExport(
    {
      meta: {
        source: "runtime.audit.export",
        generatedAt: "2026-03-08T05:00:00Z"
      },
      items: [
        {
          eventId: "audit-1",
          note: "Bearer sk-abc1234567890123456789 should be removed before audit export"
        }
      ]
    },
    {
      ...buildDesktopGovernedExportOptions(
        "audit_export",
        "compliance_review",
        "export",
        "desktop",
        EXPORT_PROFILE_CATALOG,
        ""
      ),
      orgAdminCatalog: ORG_ADMIN_CATALOG
    }
  );

  assert.equal(prepared.exportProfile, "audit_export");
  assert.equal(prepared.audience, "compliance_review");
  assert.equal(prepared.retentionClass, "archive");
  assert.ok(prepared.directorySyncMappings.length > 0);
  assert.ok(prepared.exceptionProfileLabels.length > 0);
  assert.ok(prepared.overlayProfileLabels.length > 0);
  assert.match(prepared.serialized, /\[REDACTED\]/);
  assert.match(describeGovernedExportDisposition(prepared), /profile=audit_export/);
  assert.match(describeGovernedExportDisposition(prepared), /audience=compliance_review/);
  assert.match(describeGovernedExportDisposition(prepared), /retention=archive/);
  assert.match(describeGovernedExportRedactions(prepared, "audit export"), /DLP redactions=/);
});

test("desktop incident bundle export action preserves governed disposition and overlay retention", () => {
  const prepared = prepareGovernedJsonExport(
    {
      meta: {
        packageId: "pkg-1",
        source: "desktop.incident.export"
      },
      items: [
        {
          runId: "run-1",
          payload: "API key sk-abc1234567890123456789 must be removed before export"
        }
      ]
    },
    {
      ...buildDesktopGovernedExportOptions(
        "incident_export",
        "executive_incident_review",
        "export",
        "desktop",
        EXPORT_PROFILE_CATALOG,
        ""
      ),
      orgAdminCatalog: ORG_ADMIN_CATALOG
    }
  );

  assert.equal(prepared.exportProfile, "incident_export");
  assert.equal(prepared.audience, "executive_incident_review");
  assert.equal(prepared.retentionClass, "archive");
  assert.ok(prepared.overlayProfileLabels.length > 0);
  assert.match(prepared.serialized, /\[REDACTED\]/);
  assert.match(describeGovernedExportDisposition(prepared), /profile=incident_export/);
  assert.match(describeGovernedExportDisposition(prepared), /audience=executive_incident_review/);
  assert.match(describeGovernedExportDisposition(prepared), /retention=archive/);
});

test("desktop incident handoff action preserves governed disposition and text redaction", () => {
  const prepared = prepareGovernedTextExport(
    "Incident handoff includes Bearer sk-abc1234567890123456789 and must be redacted before copy.",
    {
      ...buildDesktopGovernedExportOptions(
        "incident_handoff",
        "security_review",
        "handoff",
        "desktop",
        EXPORT_PROFILE_CATALOG,
        ""
      ),
      orgAdminCatalog: ORG_ADMIN_CATALOG
    }
  );

  assert.equal(prepared.exportProfile, "incident_handoff");
  assert.equal(prepared.audience, "security_review");
  assert.equal(prepared.retentionClass, "standard");
  assert.ok(prepared.exceptionProfileLabels.length > 0);
  assert.match(prepared.text, /\[REDACTED\]/);
  assert.match(describeGovernedExportDisposition(prepared), /profile=incident_handoff/);
  assert.match(describeGovernedExportDisposition(prepared), /audience=security_review/);
  assert.match(describeGovernedExportDisposition(prepared), /retention=standard/);
  assert.match(describeGovernedExportRedactions(prepared, "incident handoff"), /DLP redactions=/);
});

test("governed export disposition text includes active org-admin review counts", () => {
  const prepared = prepareGovernedJsonExport(
    {
      task: { taskId: "task-1" }
    },
    {
      ...buildDesktopGovernedExportOptions(
        "audit_export",
        "security_review",
        "review",
        "chat",
        EXPORT_PROFILE_CATALOG,
        ""
      ),
      approvalCheckpoints: [
        {
          checkpointId: "approval-org-admin-export-1",
          status: "PENDING",
          annotations: {
            orgAdminDecisionBinding: {
              profileId: "centralized_enterprise_admin",
              bindingId: "centralized_enterprise_admin_delegated_admin_binding",
              bindingLabel: "Centralized Enterprise Admin Delegated Admin Decision Binding",
              requestedInputKeys: ["idp_group", "tenant_id"]
            }
          }
        }
      ]
    }
  );

  const description = describeGovernedExportDisposition(prepared);
  assert.match(description, /activeBindings=1/);
  assert.match(description, /activeInputKeys=2/);
  assert.match(description, /pendingReviews=1/);
});
