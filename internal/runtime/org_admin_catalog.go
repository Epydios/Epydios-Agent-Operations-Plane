package runtime

import (
	"sort"
	"strings"
)

func defaultOrgAdminCatalog() []OrgAdminCatalogEntry {
	entries := []OrgAdminCatalogEntry{
		{
			ProfileID:         "centralized_enterprise_admin",
			Label:             "Centralized Enterprise Admin",
			Description:       "Central IT owns global policy, delegated tenant and project administration, and governed export controls across the organization hierarchy.",
			OrganizationModel: "centralized_enterprise",
			DelegationModel:   "central_it_with_tenant_project_delegation",
			AdminRoleBundles: []string{
				"enterprise.org_admin",
				"enterprise.security_admin",
				"enterprise.compliance_admin",
			},
			DelegatedAdminRoleBundles: []string{
				"enterprise.tenant_admin",
				"enterprise.project_admin",
				"enterprise.identity_admin",
			},
			BreakGlassRoleBundles: []string{
				"enterprise.break_glass_admin",
				"enterprise.break_glass_auditor",
			},
			GroupRoleMappingInputs: []OrgAdminGroupMappingInput{
				{
					Field:       "idp_group",
					Source:      "directory_sync",
					Required:    true,
					Description: "Directory group or SCIM group mapped into enterprise admin bundles.",
					Example:     "grp-agentops-org-admins",
				},
				{
					Field:       "tenant_id",
					Source:      "identity_claim",
					Required:    true,
					Description: "Tenant binding used to constrain delegated admin rights.",
					Example:     "tenant-finance-prod",
				},
				{
					Field:       "cost_center",
					Source:      "directory_sync",
					Required:    false,
					Description: "Optional attachment used for chargeback and delegated reporting.",
					Example:     "CC-20410",
				},
				{
					Field:       "environment",
					Source:      "identity_claim",
					Required:    false,
					Description: "Optional environment attachment for prod-only or staging-only delegation.",
					Example:     "prod",
				},
			},
			DirectorySyncInputs: []string{
				"idp_group",
				"tenant_id",
				"cost_center",
				"environment",
			},
			ResidencyProfiles: []string{
				"single_region_tenant_pinning",
				"regional_failover_within_jurisdiction",
			},
			ResidencyExceptionInputs: []string{
				"region",
				"jurisdiction",
				"residency_exception_ticket",
			},
			LegalHoldProfiles: []string{
				"litigation_hold",
				"security_incident_hold",
			},
			LegalHoldExceptionInputs: []string{
				"legal_hold_case_id",
				"legal_hold_reason",
				"legal_hold_expiry",
			},
			NetworkBoundaryProfiles: []string{
				"enterprise_proxy_required",
				"private_egress_preferred",
				"tls_inspection_compatible",
			},
			FleetRolloutProfiles: []string{
				"mdm_managed_desktop_ring",
				"regional_beta_ring",
			},
			QuotaDimensions: []string{
				"organization",
				"tenant",
				"project",
				"worker_adapter",
				"provider",
				"model",
			},
			QuotaOverlayInputs: []string{
				"tenant_id",
				"project_id",
				"environment",
				"cost_center",
			},
			ChargebackDimensions: []string{
				"cost_center",
				"business_unit",
				"tenant",
				"project",
				"environment",
			},
			ChargebackOverlayInputs: []string{
				"cost_center",
				"business_unit",
				"project_id",
				"environment",
			},
			DecisionSurfaces: []string{
				"policy_pack_assignment",
				"export_profile_override",
				"quota_override",
				"legal_hold_activation",
				"break_glass_activation",
			},
			EnforcementHooks: []string{
				"delegated_admin_scope_guard",
				"break_glass_timebox",
				"directory_sync_group_mapping",
				"residency_policy_exception_review",
				"legal_hold_exception_review",
				"org_quota_override_approval",
				"chargeback_override_audit",
			},
			BoundaryRequirements: []string{
				"tenant_project_scope",
				"runtime_authz",
				"audit_emission",
				"directory_group_mapping",
				"org_quota_metering",
				"governed_export_redaction",
			},
			ClientSurfaces: []string{
				"chat",
				"vscode",
				"cli",
				"workflow",
				"chatops",
				"desktop",
				"runtime",
			},
			ReportingSurfaces: []string{
				"report",
				"export",
				"admin_report",
			},
		},
		{
			ProfileID:         "federated_business_unit_admin",
			Label:             "Federated Business-Unit Admin",
			Description:       "Business-unit admins own delegated policy and chargeback within a centrally governed multi-tenant enterprise envelope.",
			OrganizationModel: "federated_business_unit",
			DelegationModel:   "business_unit_scoped_delegation",
			AdminRoleBundles: []string{
				"enterprise.org_admin",
				"enterprise.security_admin",
			},
			DelegatedAdminRoleBundles: []string{
				"enterprise.business_unit_admin",
				"enterprise.tenant_admin",
				"enterprise.project_admin",
			},
			BreakGlassRoleBundles: []string{
				"enterprise.break_glass_admin",
			},
			GroupRoleMappingInputs: []OrgAdminGroupMappingInput{
				{
					Field:       "idp_group",
					Source:      "directory_sync",
					Required:    true,
					Description: "Directory group driving delegated business-unit role assignment.",
					Example:     "grp-agentops-payments-admins",
				},
				{
					Field:       "business_unit",
					Source:      "directory_sync",
					Required:    true,
					Description: "Business-unit attachment used for delegated admin and policy scope.",
					Example:     "payments",
				},
				{
					Field:       "cost_center",
					Source:      "directory_sync",
					Required:    true,
					Description: "Chargeback field attached to business-unit scoped review and usage.",
					Example:     "CC-33120",
				},
				{
					Field:       "workflow_id",
					Source:      "workflow_context",
					Required:    false,
					Description: "Optional workflow or ticket routing input for delegated operations.",
					Example:     "jira-payments-platform",
				},
			},
			DirectorySyncInputs: []string{
				"idp_group",
				"business_unit",
				"cost_center",
				"workflow_id",
			},
			ResidencyProfiles: []string{
				"business_unit_regional_partitioning",
				"regional_residency_enforced",
			},
			ResidencyExceptionInputs: []string{
				"business_unit",
				"region",
				"residency_exception_ticket",
			},
			LegalHoldProfiles: []string{
				"business_unit_case_hold",
				"security_incident_hold",
			},
			LegalHoldExceptionInputs: []string{
				"hold_case_id",
				"hold_reason",
				"regional_counsel_approval",
			},
			NetworkBoundaryProfiles: []string{
				"proxy_by_business_unit",
				"private_egress_preferred",
			},
			FleetRolloutProfiles: []string{
				"business_unit_desktop_ring",
				"regional_package_distribution",
			},
			QuotaDimensions: []string{
				"organization",
				"business_unit",
				"tenant",
				"project",
				"worker_adapter",
			},
			QuotaOverlayInputs: []string{
				"business_unit",
				"tenant_id",
				"project_id",
				"cost_center",
			},
			ChargebackDimensions: []string{
				"business_unit",
				"cost_center",
				"project",
				"environment",
			},
			ChargebackOverlayInputs: []string{
				"business_unit",
				"cost_center",
				"project_id",
				"environment",
			},
			DecisionSurfaces: []string{
				"policy_pack_assignment",
				"quota_override",
				"export_profile_override",
			},
			EnforcementHooks: []string{
				"delegated_business_unit_scope_guard",
				"directory_sync_business_unit_mapping",
				"business_unit_quota_override_approval",
				"chargeback_override_audit",
			},
			BoundaryRequirements: []string{
				"tenant_project_scope",
				"runtime_authz",
				"audit_emission",
				"directory_group_mapping",
				"business_unit_chargeback",
			},
			ClientSurfaces: []string{
				"chat",
				"vscode",
				"cli",
				"workflow",
				"chatops",
				"desktop",
			},
			ReportingSurfaces: []string{
				"report",
				"export",
				"admin_report",
			},
		},
		{
			ProfileID:         "regulated_regional_admin",
			Label:             "Regulated Regional Admin",
			Description:       "Compliance-heavy regional governance with strict residency, legal-hold, and private-network boundaries for governed agent operations.",
			OrganizationModel: "regulated_regional",
			DelegationModel:   "regional_compliance_delegation",
			AdminRoleBundles: []string{
				"enterprise.org_admin",
				"enterprise.compliance_admin",
				"enterprise.records_admin",
			},
			DelegatedAdminRoleBundles: []string{
				"enterprise.regional_admin",
				"enterprise.tenant_admin",
			},
			BreakGlassRoleBundles: []string{
				"enterprise.break_glass_admin",
				"enterprise.break_glass_auditor",
			},
			GroupRoleMappingInputs: []OrgAdminGroupMappingInput{
				{
					Field:       "idp_group",
					Source:      "directory_sync",
					Required:    true,
					Description: "Directory group mapped into regional or compliance admin bundles.",
					Example:     "grp-agentops-emea-compliance",
				},
				{
					Field:       "region",
					Source:      "identity_claim",
					Required:    true,
					Description: "Region or jurisdiction boundary used for residency and routing enforcement.",
					Example:     "eu-central",
				},
				{
					Field:       "data_classification",
					Source:      "directory_sync",
					Required:    true,
					Description: "Classification input for legal-hold and export restrictions.",
					Example:     "regulated-pii",
				},
				{
					Field:       "legal_entity",
					Source:      "directory_sync",
					Required:    false,
					Description: "Optional legal-entity field for residency and records-retention reporting.",
					Example:     "epydios-eu-gmbh",
				},
			},
			DirectorySyncInputs: []string{
				"idp_group",
				"region",
				"data_classification",
				"legal_entity",
			},
			ResidencyProfiles: []string{
				"single_jurisdiction_enforced",
				"regional_failover_blocked",
			},
			ResidencyExceptionInputs: []string{
				"region",
				"jurisdiction",
				"cross_region_exception_ticket",
			},
			LegalHoldProfiles: []string{
				"litigation_hold",
				"regulatory_hold",
				"ediscovery_hold",
			},
			LegalHoldExceptionInputs: []string{
				"hold_case_id",
				"regulator_reference",
				"exception_expiry",
			},
			NetworkBoundaryProfiles: []string{
				"private_connectivity_only",
				"regional_egress_allowlist",
				"mutual_tls_enterprise_edge",
			},
			FleetRolloutProfiles: []string{
				"mdm_managed_regional_ring",
				"signed_package_required",
			},
			QuotaDimensions: []string{
				"organization",
				"region",
				"tenant",
				"project",
				"export_profile",
			},
			QuotaOverlayInputs: []string{
				"region",
				"tenant_id",
				"project_id",
				"data_classification",
			},
			ChargebackDimensions: []string{
				"region",
				"legal_entity",
				"project",
			},
			ChargebackOverlayInputs: []string{
				"region",
				"legal_entity",
				"cost_center",
				"project_id",
			},
			DecisionSurfaces: []string{
				"residency_policy_assignment",
				"legal_hold_activation",
				"export_profile_override",
				"break_glass_activation",
			},
			EnforcementHooks: []string{
				"regional_residency_guard",
				"cross_border_exception_review",
				"legal_hold_exception_review",
				"break_glass_timebox",
				"regional_quota_override_approval",
			},
			BoundaryRequirements: []string{
				"tenant_project_scope",
				"runtime_authz",
				"audit_emission",
				"directory_group_mapping",
				"jurisdictional_residency",
				"governed_export_redaction",
			},
			ClientSurfaces: []string{
				"chat",
				"vscode",
				"cli",
				"workflow",
				"chatops",
				"desktop",
				"runtime",
			},
			ReportingSurfaces: []string{
				"report",
				"export",
				"compliance_report",
				"admin_report",
			},
		},
	}
	for i := range entries {
		entries[i].EnforcementProfiles = buildOrgAdminEnforcementProfiles(entries[i])
		entries[i].DirectorySyncMappings = buildOrgAdminDirectorySyncMappings(entries[i])
		entries[i].ExceptionProfiles = buildOrgAdminExceptionProfiles(entries[i])
		entries[i].OverlayProfiles = buildOrgAdminOverlayProfiles(entries[i])
		entries[i].DecisionBindings = buildOrgAdminDecisionBindings(entries[i])
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].ProfileID < entries[j].ProfileID
	})
	return entries
}

func buildOrgAdminDirectorySyncMappings(entry OrgAdminCatalogEntry) []OrgAdminDirectorySyncMapping {
	if len(entry.DirectorySyncInputs) == 0 && len(entry.GroupRoleMappingInputs) == 0 {
		return nil
	}
	return []OrgAdminDirectorySyncMapping{
		{
			MappingID:        entry.ProfileID + "_directory_sync_mapping",
			Label:            entry.Label + " Directory Sync Mapping",
			MappingMode:      "group_to_role_binding",
			SourceSystems:    sourceSystemsForGroupMappings(entry.GroupRoleMappingInputs),
			RequiredInputs:   sortedUniqueOrgAdminStrings(entry.DirectorySyncInputs),
			RoleBundles:      combineOrgAdminRoleBundleSet(entry),
			ScopeDimensions:  orgAdminScopeDimensions(entry),
			DecisionSurfaces: filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "policy_pack_assignment", "break_glass_activation"),
		},
	}
}

func buildOrgAdminExceptionProfiles(entry OrgAdminCatalogEntry) []OrgAdminExceptionProfile {
	profiles := make([]OrgAdminExceptionProfile, 0, 2)
	if len(entry.ResidencyProfiles) > 0 || len(entry.ResidencyExceptionInputs) > 0 {
		profiles = append(profiles, OrgAdminExceptionProfile{
			ProfileID:            entry.ProfileID + "_residency_exception",
			Label:                entry.Label + " Residency Exception",
			Category:             "residency",
			ExceptionMode:        "ticketed_exception_review",
			ManagedProfiles:      sortedUniqueOrgAdminStrings(entry.ResidencyProfiles),
			RequiredInputs:       sortedUniqueOrgAdminStrings(entry.ResidencyExceptionInputs),
			RoleBundles:          combineOrgAdminRoleBundleSet(entry),
			DecisionSurfaces:     filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "export_profile_override"),
			BoundaryRequirements: filterOrgAdminBoundaryRequirements(entry.BoundaryRequirements, "tenant_project_scope", "runtime_authz", "governed_export_redaction"),
		})
	}
	if len(entry.LegalHoldProfiles) > 0 || len(entry.LegalHoldExceptionInputs) > 0 {
		profiles = append(profiles, OrgAdminExceptionProfile{
			ProfileID:            entry.ProfileID + "_legal_hold_exception",
			Label:                entry.Label + " Legal Hold Exception",
			Category:             "legal_hold",
			ExceptionMode:        "hold_exception_review",
			ManagedProfiles:      sortedUniqueOrgAdminStrings(entry.LegalHoldProfiles),
			RequiredInputs:       sortedUniqueOrgAdminStrings(entry.LegalHoldExceptionInputs),
			RoleBundles:          combineOrgAdminRoleBundleSet(entry),
			DecisionSurfaces:     filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "legal_hold_activation"),
			BoundaryRequirements: filterOrgAdminBoundaryRequirements(entry.BoundaryRequirements, "audit_emission", "runtime_authz", "governed_export_redaction"),
		})
	}
	return profiles
}

func buildOrgAdminOverlayProfiles(entry OrgAdminCatalogEntry) []OrgAdminOverlayProfile {
	profiles := make([]OrgAdminOverlayProfile, 0, 2)
	if len(entry.QuotaDimensions) > 0 || len(entry.QuotaOverlayInputs) > 0 {
		profiles = append(profiles, OrgAdminOverlayProfile{
			OverlayID:            entry.ProfileID + "_quota_overlay",
			Label:                entry.Label + " Quota Overlay",
			Category:             "quota",
			OverlayMode:          "quota_override_review",
			TargetDimensions:     sortedUniqueOrgAdminStrings(entry.QuotaDimensions),
			RequiredInputs:       sortedUniqueOrgAdminStrings(entry.QuotaOverlayInputs),
			RoleBundles:          combineOrgAdminRoleBundleSet(entry),
			DecisionSurfaces:     filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "quota_override"),
			BoundaryRequirements: filterOrgAdminBoundaryRequirements(entry.BoundaryRequirements, "org_quota_metering", "audit_emission", "runtime_authz"),
		})
	}
	if len(entry.ChargebackDimensions) > 0 || len(entry.ChargebackOverlayInputs) > 0 {
		profiles = append(profiles, OrgAdminOverlayProfile{
			OverlayID:            entry.ProfileID + "_chargeback_overlay",
			Label:                entry.Label + " Chargeback Overlay",
			Category:             "chargeback",
			OverlayMode:          "chargeback_allocation_review",
			TargetDimensions:     sortedUniqueOrgAdminStrings(entry.ChargebackDimensions),
			RequiredInputs:       sortedUniqueOrgAdminStrings(entry.ChargebackOverlayInputs),
			RoleBundles:          combineOrgAdminRoleBundleSet(entry),
			DecisionSurfaces:     filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "quota_override", "export_profile_override"),
			BoundaryRequirements: filterOrgAdminBoundaryRequirements(entry.BoundaryRequirements, "org_quota_metering", "audit_emission"),
		})
	}
	return profiles
}

func buildOrgAdminEnforcementProfiles(entry OrgAdminCatalogEntry) []OrgAdminEnforcementProfile {
	profiles := make([]OrgAdminEnforcementProfile, 0, len(entry.EnforcementHooks))
	for _, hookID := range entry.EnforcementHooks {
		if hookID == "" {
			continue
		}
		profiles = append(profiles, OrgAdminEnforcementProfile{
			HookID:               hookID,
			Label:                labelForOrgAdminEnforcementHook(hookID),
			Category:             categoryForOrgAdminEnforcementHook(hookID),
			EnforcementMode:      modeForOrgAdminEnforcementHook(hookID),
			Description:          descriptionForOrgAdminEnforcementHook(hookID, entry),
			RoleBundles:          roleBundlesForOrgAdminEnforcementHook(hookID, entry),
			RequiredInputs:       requiredInputsForOrgAdminEnforcementHook(hookID, entry),
			DecisionSurfaces:     decisionSurfacesForOrgAdminEnforcementHook(hookID, entry),
			BoundaryRequirements: append([]string(nil), entry.BoundaryRequirements...),
		})
	}
	return profiles
}

func buildOrgAdminDecisionBindings(entry OrgAdminCatalogEntry) []OrgAdminDecisionBinding {
	configs := []struct {
		category string
		suffix   string
		label    string
		mode     string
	}{
		{
			category: "delegated_admin",
			suffix:   "delegated_admin_binding",
			label:    entry.Label + " Delegated Admin Decision Binding",
			mode:     "delegated_admin_scope_review",
		},
		{
			category: "break_glass",
			suffix:   "break_glass_binding",
			label:    entry.Label + " Break-Glass Decision Binding",
			mode:     "break_glass_activation",
		},
		{
			category: "directory_sync",
			suffix:   "directory_sync_binding",
			label:    entry.Label + " Directory Sync Decision Binding",
			mode:     "directory_sync_mapping_review",
		},
		{
			category: "residency",
			suffix:   "residency_exception_binding",
			label:    entry.Label + " Residency Exception Binding",
			mode:     "residency_exception_review",
		},
		{
			category: "legal_hold",
			suffix:   "legal_hold_exception_binding",
			label:    entry.Label + " Legal-Hold Exception Binding",
			mode:     "legal_hold_exception_review",
		},
		{
			category: "quota",
			suffix:   "quota_overlay_binding",
			label:    entry.Label + " Quota Overlay Binding",
			mode:     "quota_override_review",
		},
		{
			category: "chargeback",
			suffix:   "chargeback_overlay_binding",
			label:    entry.Label + " Chargeback Overlay Binding",
			mode:     "chargeback_allocation_review",
		},
	}
	bindings := make([]OrgAdminDecisionBinding, 0, len(configs))
	for _, cfg := range configs {
		binding := OrgAdminDecisionBinding{
			BindingID:   entry.ProfileID + "_" + cfg.suffix,
			Label:       cfg.label,
			Category:    cfg.category,
			BindingMode: cfg.mode,
		}
		for _, profile := range entry.EnforcementProfiles {
			if profile.Category != cfg.category {
				continue
			}
			binding.HookIDs = append(binding.HookIDs, profile.HookID)
			binding.RoleBundles = append(binding.RoleBundles, profile.RoleBundles...)
			binding.RequiredInputs = append(binding.RequiredInputs, profile.RequiredInputs...)
			binding.DecisionSurfaces = append(binding.DecisionSurfaces, profile.DecisionSurfaces...)
			binding.BoundaryRequirements = append(binding.BoundaryRequirements, profile.BoundaryRequirements...)
		}
		if cfg.category == "delegated_admin" || cfg.category == "directory_sync" {
			for _, mapping := range entry.DirectorySyncMappings {
				binding.DirectorySyncMappings = append(binding.DirectorySyncMappings, mapping.MappingID)
				binding.RoleBundles = append(binding.RoleBundles, mapping.RoleBundles...)
				binding.RequiredInputs = append(binding.RequiredInputs, mapping.RequiredInputs...)
				binding.DecisionSurfaces = append(binding.DecisionSurfaces, mapping.DecisionSurfaces...)
			}
		}
		for _, profile := range entry.ExceptionProfiles {
			if profile.Category != cfg.category {
				continue
			}
			binding.ExceptionProfiles = append(binding.ExceptionProfiles, profile.ProfileID)
			binding.RoleBundles = append(binding.RoleBundles, profile.RoleBundles...)
			binding.RequiredInputs = append(binding.RequiredInputs, profile.RequiredInputs...)
			binding.DecisionSurfaces = append(binding.DecisionSurfaces, profile.DecisionSurfaces...)
			binding.BoundaryRequirements = append(binding.BoundaryRequirements, profile.BoundaryRequirements...)
		}
		for _, profile := range entry.OverlayProfiles {
			if profile.Category != cfg.category {
				continue
			}
			binding.OverlayProfiles = append(binding.OverlayProfiles, profile.OverlayID)
			binding.RoleBundles = append(binding.RoleBundles, profile.RoleBundles...)
			binding.RequiredInputs = append(binding.RequiredInputs, profile.RequiredInputs...)
			binding.DecisionSurfaces = append(binding.DecisionSurfaces, profile.DecisionSurfaces...)
			binding.BoundaryRequirements = append(binding.BoundaryRequirements, profile.BoundaryRequirements...)
		}
		if len(binding.RoleBundles) == 0 {
			binding.RoleBundles = fallbackRoleBundlesForOrgAdminDecisionBinding(entry, cfg.category)
		}
		if len(binding.RequiredInputs) == 0 {
			binding.RequiredInputs = fallbackInputsForOrgAdminDecisionBinding(entry, cfg.category)
		}
		if len(binding.DecisionSurfaces) == 0 {
			binding.DecisionSurfaces = fallbackDecisionSurfacesForOrgAdminDecisionBinding(entry, cfg.category)
		}
		if len(binding.BoundaryRequirements) == 0 {
			binding.BoundaryRequirements = fallbackBoundaryRequirementsForOrgAdminDecisionBinding(entry, cfg.category)
		}
		binding.HookIDs = sortedUniqueOrgAdminStrings(binding.HookIDs)
		binding.DirectorySyncMappings = sortedUniqueOrgAdminStrings(binding.DirectorySyncMappings)
		binding.ExceptionProfiles = sortedUniqueOrgAdminStrings(binding.ExceptionProfiles)
		binding.OverlayProfiles = sortedUniqueOrgAdminStrings(binding.OverlayProfiles)
		binding.RoleBundles = sortedUniqueOrgAdminStrings(binding.RoleBundles)
		binding.RequiredInputs = sortedUniqueOrgAdminStrings(binding.RequiredInputs)
		binding.DecisionSurfaces = sortedUniqueOrgAdminStrings(binding.DecisionSurfaces)
		binding.BoundaryRequirements = sortedUniqueOrgAdminStrings(binding.BoundaryRequirements)
		if !hasOrgAdminDecisionBindingData(binding) {
			continue
		}
		bindings = append(bindings, binding)
	}
	sort.Slice(bindings, func(i, j int) bool {
		return bindings[i].BindingID < bindings[j].BindingID
	})
	return bindings
}

func hasOrgAdminDecisionBindingData(binding OrgAdminDecisionBinding) bool {
	return len(binding.HookIDs) > 0 ||
		len(binding.DirectorySyncMappings) > 0 ||
		len(binding.ExceptionProfiles) > 0 ||
		len(binding.OverlayProfiles) > 0 ||
		len(binding.RoleBundles) > 0 ||
		len(binding.RequiredInputs) > 0 ||
		len(binding.DecisionSurfaces) > 0
}

func fallbackRoleBundlesForOrgAdminDecisionBinding(entry OrgAdminCatalogEntry, category string) []string {
	switch category {
	case "delegated_admin":
		return append([]string(nil), entry.DelegatedAdminRoleBundles...)
	case "break_glass":
		return append([]string(nil), entry.BreakGlassRoleBundles...)
	case "directory_sync":
		return combineOrgAdminRoleBundleSet(entry)
	case "legal_hold":
		return sortedUniqueOrgAdminStrings(append(append([]string(nil), entry.AdminRoleBundles...), entry.BreakGlassRoleBundles...))
	case "quota", "chargeback", "residency":
		return sortedUniqueOrgAdminStrings(append(append([]string(nil), entry.AdminRoleBundles...), entry.DelegatedAdminRoleBundles...))
	default:
		return combineOrgAdminRoleBundleSet(entry)
	}
}

func fallbackInputsForOrgAdminDecisionBinding(entry OrgAdminCatalogEntry, category string) []string {
	switch category {
	case "delegated_admin", "directory_sync":
		return append([]string(nil), entry.DirectorySyncInputs...)
	case "break_glass":
		return []string{"break_glass_ticket", "break_glass_reason", "break_glass_expiry"}
	case "residency":
		return append([]string(nil), entry.ResidencyExceptionInputs...)
	case "legal_hold":
		return append([]string(nil), entry.LegalHoldExceptionInputs...)
	case "quota":
		return sortedUniqueOrgAdminStrings(append(append([]string(nil), entry.QuotaOverlayInputs...), entry.QuotaDimensions...))
	case "chargeback":
		return sortedUniqueOrgAdminStrings(append(append([]string(nil), entry.ChargebackOverlayInputs...), entry.ChargebackDimensions...))
	default:
		return nil
	}
}

func fallbackDecisionSurfacesForOrgAdminDecisionBinding(entry OrgAdminCatalogEntry, category string) []string {
	switch category {
	case "break_glass":
		return filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "break_glass_activation")
	case "residency":
		return filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "residency_policy_assignment", "export_profile_override")
	case "legal_hold":
		return filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "legal_hold_activation", "export_profile_override")
	case "quota":
		return filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "quota_override")
	case "chargeback":
		return filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "quota_override", "export_profile_override")
	default:
		return append([]string(nil), entry.DecisionSurfaces...)
	}
}

func fallbackBoundaryRequirementsForOrgAdminDecisionBinding(entry OrgAdminCatalogEntry, category string) []string {
	switch category {
	case "directory_sync", "delegated_admin":
		return filterOrgAdminBoundaryRequirements(entry.BoundaryRequirements, "tenant_project_scope", "runtime_authz", "directory_group_mapping", "audit_emission")
	case "break_glass":
		return filterOrgAdminBoundaryRequirements(entry.BoundaryRequirements, "runtime_authz", "audit_emission")
	case "residency":
		return filterOrgAdminBoundaryRequirements(entry.BoundaryRequirements, "runtime_authz", "audit_emission", "governed_export_redaction", "jurisdictional_residency")
	case "legal_hold":
		return filterOrgAdminBoundaryRequirements(entry.BoundaryRequirements, "runtime_authz", "audit_emission", "governed_export_redaction")
	case "quota", "chargeback":
		return filterOrgAdminBoundaryRequirements(entry.BoundaryRequirements, "runtime_authz", "audit_emission", "org_quota_metering")
	default:
		return append([]string(nil), entry.BoundaryRequirements...)
	}
}

func labelForOrgAdminEnforcementHook(hookID string) string {
	switch hookID {
	case "delegated_admin_scope_guard":
		return "Delegated Admin Scope Guard"
	case "delegated_business_unit_scope_guard":
		return "Delegated Business-Unit Scope Guard"
	case "break_glass_timebox":
		return "Break-Glass Timebox"
	case "directory_sync_group_mapping":
		return "Directory Sync Group Mapping"
	case "directory_sync_business_unit_mapping":
		return "Directory Sync Business-Unit Mapping"
	case "regional_residency_guard":
		return "Regional Residency Guard"
	case "cross_border_exception_review":
		return "Cross-Border Exception Review"
	case "residency_policy_exception_review":
		return "Residency Policy Exception Review"
	case "legal_hold_exception_review":
		return "Legal-Hold Exception Review"
	case "org_quota_override_approval":
		return "Org Quota Override Approval"
	case "business_unit_quota_override_approval":
		return "Business-Unit Quota Override Approval"
	case "regional_quota_override_approval":
		return "Regional Quota Override Approval"
	case "chargeback_override_audit":
		return "Chargeback Override Audit"
	default:
		return hookID
	}
}

func categoryForOrgAdminEnforcementHook(hookID string) string {
	switch {
	case hookID == "delegated_admin_scope_guard" || hookID == "delegated_business_unit_scope_guard":
		return "delegated_admin"
	case hookID == "break_glass_timebox":
		return "break_glass"
	case hookID == "directory_sync_group_mapping" || hookID == "directory_sync_business_unit_mapping":
		return "directory_sync"
	case hookID == "regional_residency_guard" || hookID == "cross_border_exception_review" || hookID == "residency_policy_exception_review":
		return "residency"
	case hookID == "legal_hold_exception_review":
		return "legal_hold"
	case hookID == "org_quota_override_approval" || hookID == "business_unit_quota_override_approval" || hookID == "regional_quota_override_approval":
		return "quota"
	case hookID == "chargeback_override_audit":
		return "chargeback"
	default:
		return "admin"
	}
}

func modeForOrgAdminEnforcementHook(hookID string) string {
	switch categoryForOrgAdminEnforcementHook(hookID) {
	case "delegated_admin":
		return "scope_guard"
	case "break_glass":
		return "timeboxed_elevation"
	case "directory_sync":
		return "mapping_validation"
	case "residency", "legal_hold":
		return "exception_review"
	case "quota":
		return "approval_required"
	case "chargeback":
		return "audit_required"
	default:
		return "governed_review"
	}
}

func descriptionForOrgAdminEnforcementHook(hookID string, entry OrgAdminCatalogEntry) string {
	switch categoryForOrgAdminEnforcementHook(hookID) {
	case "delegated_admin":
		return "Delegated admin actions stay constrained to the mapped tenant, project, business-unit, or regional scope before governance decisions are accepted."
	case "break_glass":
		return "Break-glass elevation is timeboxed, separately audited, and restricted to the profile's declared emergency role bundles."
	case "directory_sync":
		return "Directory-sync and identity-claim inputs are validated before delegated role bundles and reporting scope are attached."
	case "residency":
		return "Residency and cross-border exception inputs are reviewed against the profile's regional policy posture before override actions continue."
	case "legal_hold":
		return "Legal-hold exception actions require hold-specific metadata and a governed review path before export or evidence changes proceed."
	case "quota":
		return "Quota overrides require explicit overlay inputs tied to the profile's quota dimensions before capacity changes are approved."
	case "chargeback":
		return "Chargeback overrides remain audited against the profile's cost and business attribution inputs before reporting changes are accepted."
	default:
		return "Enterprise admin actions remain attached to the governed org-admin contract for this operating model."
	}
}

func roleBundlesForOrgAdminEnforcementHook(hookID string, entry OrgAdminCatalogEntry) []string {
	switch categoryForOrgAdminEnforcementHook(hookID) {
	case "delegated_admin":
		return append([]string(nil), entry.DelegatedAdminRoleBundles...)
	case "break_glass":
		return append([]string(nil), entry.BreakGlassRoleBundles...)
	case "directory_sync", "residency", "quota", "chargeback":
		roleBundles := append([]string(nil), entry.AdminRoleBundles...)
		roleBundles = append(roleBundles, entry.DelegatedAdminRoleBundles...)
		return sortedUniqueOrgAdminStrings(roleBundles)
	case "legal_hold":
		roleBundles := append([]string(nil), entry.AdminRoleBundles...)
		roleBundles = append(roleBundles, entry.BreakGlassRoleBundles...)
		return sortedUniqueOrgAdminStrings(roleBundles)
	default:
		return append([]string(nil), entry.AdminRoleBundles...)
	}
}

func requiredInputsForOrgAdminEnforcementHook(hookID string, entry OrgAdminCatalogEntry) []string {
	switch categoryForOrgAdminEnforcementHook(hookID) {
	case "delegated_admin":
		inputs := append([]string(nil), entry.DirectorySyncInputs...)
		for _, field := range []string{"project_id", "tenant_id", "business_unit", "region", "environment"} {
			inputs = append(inputs, field)
		}
		return sortedUniqueOrgAdminStrings(inputs)
	case "break_glass":
		return []string{"break_glass_ticket", "break_glass_reason", "break_glass_expiry"}
	case "directory_sync":
		return append([]string(nil), entry.DirectorySyncInputs...)
	case "residency":
		return append([]string(nil), entry.ResidencyExceptionInputs...)
	case "legal_hold":
		return append([]string(nil), entry.LegalHoldExceptionInputs...)
	case "quota":
		inputs := append([]string(nil), entry.QuotaOverlayInputs...)
		inputs = append(inputs, entry.QuotaDimensions...)
		return sortedUniqueOrgAdminStrings(inputs)
	case "chargeback":
		inputs := append([]string(nil), entry.ChargebackOverlayInputs...)
		inputs = append(inputs, entry.ChargebackDimensions...)
		return sortedUniqueOrgAdminStrings(inputs)
	default:
		return nil
	}
}

func decisionSurfacesForOrgAdminEnforcementHook(hookID string, entry OrgAdminCatalogEntry) []string {
	switch categoryForOrgAdminEnforcementHook(hookID) {
	case "break_glass":
		return filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "break_glass_activation")
	case "residency":
		return filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "residency_policy_assignment", "export_profile_override")
	case "legal_hold":
		return filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "legal_hold_activation", "export_profile_override")
	case "quota":
		return filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "quota_override")
	case "chargeback":
		return filterOrgAdminDecisionSurfaces(entry.DecisionSurfaces, "quota_override", "export_profile_override")
	default:
		return append([]string(nil), entry.DecisionSurfaces...)
	}
}

func filterOrgAdminDecisionSurfaces(items []string, allowed ...string) []string {
	if len(allowed) == 0 {
		return append([]string(nil), items...)
	}
	index := map[string]struct{}{}
	for _, item := range allowed {
		index[item] = struct{}{}
	}
	filtered := make([]string, 0, len(items))
	for _, item := range items {
		if _, ok := index[item]; ok {
			filtered = append(filtered, item)
		}
	}
	if len(filtered) == 0 {
		return append([]string(nil), items...)
	}
	return filtered
}

func sortedUniqueOrgAdminStrings(items []string) []string {
	index := map[string]struct{}{}
	filtered := make([]string, 0, len(items))
	for _, item := range items {
		if item == "" {
			continue
		}
		if _, ok := index[item]; ok {
			continue
		}
		index[item] = struct{}{}
		filtered = append(filtered, item)
	}
	sort.Strings(filtered)
	return filtered
}

func filterOrgAdminBoundaryRequirements(boundaries []string, candidates ...string) []string {
	if len(boundaries) == 0 || len(candidates) == 0 {
		return sortedUniqueOrgAdminStrings(boundaries)
	}
	candidateSet := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		if trimmed := strings.TrimSpace(candidate); trimmed != "" {
			candidateSet[trimmed] = struct{}{}
		}
	}
	filtered := make([]string, 0, len(boundaries))
	for _, boundary := range boundaries {
		trimmed := strings.TrimSpace(boundary)
		if trimmed == "" {
			continue
		}
		if _, ok := candidateSet[trimmed]; ok {
			filtered = append(filtered, trimmed)
		}
	}
	if len(filtered) > 0 {
		return sortedUniqueOrgAdminStrings(filtered)
	}
	return sortedUniqueOrgAdminStrings(boundaries)
}

func sourceSystemsForGroupMappings(inputs []OrgAdminGroupMappingInput) []string {
	values := make([]string, 0, len(inputs))
	for _, input := range inputs {
		if trimmed := strings.TrimSpace(input.Source); trimmed != "" {
			values = append(values, trimmed)
		}
	}
	if len(values) == 0 {
		values = append(values, "directory_sync")
	}
	return sortedUniqueOrgAdminStrings(values)
}

func combineOrgAdminRoleBundleSet(entry OrgAdminCatalogEntry) []string {
	values := append([]string(nil), entry.AdminRoleBundles...)
	values = append(values, entry.DelegatedAdminRoleBundles...)
	values = append(values, entry.BreakGlassRoleBundles...)
	return sortedUniqueOrgAdminStrings(values)
}

func orgAdminScopeDimensions(entry OrgAdminCatalogEntry) []string {
	values := make([]string, 0)
	for _, input := range entry.GroupRoleMappingInputs {
		switch strings.TrimSpace(input.Field) {
		case "tenant_id", "project_id", "business_unit", "environment", "region", "jurisdiction", "cost_center":
			values = append(values, strings.TrimSpace(input.Field))
		}
	}
	return sortedUniqueOrgAdminStrings(values)
}
