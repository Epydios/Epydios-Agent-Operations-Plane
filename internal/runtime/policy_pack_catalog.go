package runtime

import (
	"sort"
	"strings"
)

func defaultPolicyPackCatalog(auth *AuthEnforcer) []PolicyPackCatalogEntry {
	workerCatalog := defaultWorkerCapabilityCatalog()
	readRoles := authzRolesForPermission(auth, PermissionRunRead)
	operatorRoles := authzRolesForAllPermissions(auth, PermissionRunRead, PermissionRunCreate)
	rawModelEntries := filterWorkerCapabilitiesByExecutionMode(workerCatalog, AgentInvokeExecutionModeRawModelInvoke)
	managedCodexEntries := filterWorkerCapabilitiesByExecutionMode(workerCatalog, AgentInvokeExecutionModeManagedCodexWorker)

	entries := []PolicyPackCatalogEntry{
		{
			PackID:       "read_only_review",
			Label:        "Read-Only Review",
			Description:  "Review-only access to governed task, session, approval, evidence, and worker state without run submission or execution privileges.",
			RoleBundles:  []string{"enterprise.observer", "enterprise.reviewer"},
			Roles:        readRoles,
			Permissions:  []string{PermissionRunRead},
			Capabilities: []string{"task_review", "session_timeline_review", "approval_review", "evidence_review"},
			BoundaryRequirements: []string{
				"tenant_project_scope",
				"runtime_authz",
				"audit_emission",
			},
			DecisionSurfaces: []string{"review_only"},
			ClientSurfaces:   []string{"chat", "vscode", "cli", "workflow", "chatops"},
			ReportingSurfaces: []string{
				"update",
				"delta-update",
				"report",
			},
		},
		{
			PackID:                   "governed_model_invoke_operator",
			Label:                    "Governed Model Invoke Operator",
			Description:              "Submit direct governed model turns and decide approval checkpoints on the native session contract without managed-worker execution.",
			RoleBundles:              []string{"enterprise.operator", "enterprise.ai_operator"},
			Roles:                    operatorRoles,
			Permissions:              []string{PermissionRunRead, PermissionRunCreate},
			ApplicableExecutionModes: []string{AgentInvokeExecutionModeRawModelInvoke},
			ApplicableWorkerTypes:    []string{"model_invoke"},
			ApplicableAdapterIDs:     uniqueCatalogAdapterIDs(rawModelEntries),
			Capabilities:             uniqueCatalogCapabilities(rawModelEntries),
			BoundaryRequirements:     uniqueCatalogBoundaryRequirements(rawModelEntries),
			DecisionSurfaces: []string{
				"governed_turn_submission",
				"approval_checkpoint",
			},
			ClientSurfaces: []string{"chat", "vscode", "cli", "workflow", "chatops"},
			ReportingSurfaces: []string{
				"update",
				"delta-update",
				"report",
			},
		},
		{
			PackID:                   "managed_codex_worker_operator",
			Label:                    "Managed Codex Worker Operator",
			Description:              "Launch, recover, and control a managed Codex worker with governed tool proposals, approvals, tool execution, and evidence capture.",
			RoleBundles:              []string{"enterprise.operator", "enterprise.ai_operator", "enterprise.worker_controller"},
			Roles:                    operatorRoles,
			Permissions:              []string{PermissionRunRead, PermissionRunCreate},
			ApplicableExecutionModes: []string{AgentInvokeExecutionModeManagedCodexWorker},
			ApplicableWorkerTypes:    []string{"managed_agent"},
			ApplicableAdapterIDs:     uniqueCatalogAdapterIDs(managedCodexEntries),
			Capabilities:             uniqueCatalogCapabilities(managedCodexEntries),
			BoundaryRequirements:     uniqueCatalogBoundaryRequirements(managedCodexEntries),
			DecisionSurfaces: []string{
				"managed_worker_launch",
				"managed_worker_recovery",
				"approval_checkpoint",
				"tool_proposal",
				"governed_tool_action",
			},
			ClientSurfaces: []string{"chat", "vscode", "cli", "workflow", "chatops"},
			ReportingSurfaces: []string{
				"update",
				"delta-update",
				"report",
			},
		},
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].PackID < entries[j].PackID
	})
	return entries
}

func filterWorkerCapabilitiesByExecutionMode(items []WorkerCapabilityCatalogEntry, executionMode string) []WorkerCapabilityCatalogEntry {
	filtered := make([]WorkerCapabilityCatalogEntry, 0, len(items))
	for _, item := range items {
		if !strings.EqualFold(strings.TrimSpace(item.ExecutionMode), strings.TrimSpace(executionMode)) {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func uniqueCatalogCapabilities(items []WorkerCapabilityCatalogEntry) []string {
	collected := make([]string, 0)
	for _, item := range items {
		collected = append(collected, item.Capabilities...)
	}
	return sortedUnique(collected)
}

func uniqueCatalogBoundaryRequirements(items []WorkerCapabilityCatalogEntry) []string {
	collected := make([]string, 0)
	for _, item := range items {
		collected = append(collected, item.BoundaryRequirements...)
	}
	return sortedUnique(collected)
}

func uniqueCatalogAdapterIDs(items []WorkerCapabilityCatalogEntry) []string {
	collected := make([]string, 0, len(items))
	for _, item := range items {
		collected = append(collected, item.AdapterID)
	}
	return sortedUnique(collected)
}

func authzRolesForPermission(auth *AuthEnforcer, permission string) []string {
	roles := make([]string, 0)
	if auth != nil {
		for role, permissions := range auth.rolePermissionMatrix {
			if _, ok := permissions[permission]; ok {
				roles = append(roles, role)
			}
		}
	}
	if len(roles) == 0 {
		switch permission {
		case PermissionRunCreate:
			roles = append(roles, "runtime.admin", PermissionRunCreate)
		case PermissionRunRead:
			roles = append(roles, "runtime.admin", PermissionRunRead)
		}
	}
	return sortedUnique(roles)
}

func authzRolesForAllPermissions(auth *AuthEnforcer, permissions ...string) []string {
	if len(permissions) == 0 {
		return nil
	}
	roles := make([]string, 0)
	if auth != nil && len(auth.rolePermissionMatrix) > 0 {
		for role, granted := range auth.rolePermissionMatrix {
			matched := true
			for _, permission := range permissions {
				if _, ok := granted[permission]; !ok {
					matched = false
					break
				}
			}
			if matched {
				roles = append(roles, role)
			}
		}
	}
	if len(roles) == 0 {
		roles = append(roles, "runtime.admin")
		for _, permission := range permissions {
			roles = append(roles, authzRolesForPermission(auth, permission)...)
		}
	}
	return sortedUnique(roles)
}
