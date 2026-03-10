package runtime

import "sort"

func defaultWorkerCapabilityCatalog() []WorkerCapabilityCatalogEntry {
	entries := []WorkerCapabilityCatalogEntry{
		managedCodexWorkerCapabilityEntry(),
	}
	for _, profile := range defaultAgentProfiles() {
		entries = append(entries, modelInvokeWorkerCapabilityEntry(profile))
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].ExecutionMode == entries[j].ExecutionMode {
			return entries[i].AdapterID < entries[j].AdapterID
		}
		return entries[i].ExecutionMode < entries[j].ExecutionMode
	})
	return entries
}

func managedCodexWorkerCapabilityEntry() WorkerCapabilityCatalogEntry {
	descriptor := invokeExecutionDescriptorForRequest(&AgentInvokeRequest{
		AgentProfileID: "codex",
		ExecutionMode:  AgentInvokeExecutionModeManagedCodexWorker,
	})
	return WorkerCapabilityCatalogEntry{
		ExecutionMode: descriptor.executionMode,
		WorkerType:    descriptor.workerType,
		AdapterID:     descriptor.workerAdapterID,
		Label:         "Managed Codex Worker",
		Description:   "AgentOps-managed Codex worker turns with governed tool proposals, approval checkpoints, evidence capture, and gateway-bound provider traffic.",
		Provider:      "agentops_gateway",
		Transport:     "responses_api",
		Model:         "gpt-5-codex",
		Capabilities:  append([]string(nil), descriptor.workerCapabilities...),
		SupportedToolActionTypes: []string{
			descriptor.toolActionType,
			"terminal_command",
			governedActionProposalType,
		},
		SupportedEvidenceKinds: []string{
			descriptor.evidenceKind,
		},
		SupportedApprovalKinds: []string{
			"tool_proposal",
			"capability_grant",
		},
		SupportedEventTypes: []string{
			"worker.attached",
			"worker.bridge.started",
			"worker.status.changed",
			"worker.progress",
			"worker.output.delta",
			"tool_proposal.generated",
			"tool_proposal.decided",
		},
		BoundaryRequirements: []string{
			"tenant_project_scope",
			"runtime_authz",
			"audit_emission",
			"ref_resolved_credentials",
			"agentops_gateway_boundary",
			"governed_tool_execution",
		},
		TargetEnvironments: []string{
			descriptor.workerTargetEnv,
		},
	}
}

func modelInvokeWorkerCapabilityEntry(profile agentProfileConfig) WorkerCapabilityCatalogEntry {
	descriptor := invokeExecutionDescriptorForRequest(&AgentInvokeRequest{
		AgentProfileID: profile.ID,
		ExecutionMode:  AgentInvokeExecutionModeRawModelInvoke,
	})
	return WorkerCapabilityCatalogEntry{
		ExecutionMode: descriptor.executionMode,
		WorkerType:    descriptor.workerType,
		AdapterID:     profile.ID,
		Label:         normalizeStringOrDefault(profile.Label, profile.ID),
		Description:   "Direct governed model invocation through the runtime integration path.",
		Provider:      profile.Provider,
		Transport:     profile.Transport,
		Model:         profile.Model,
		Capabilities:  append([]string(nil), descriptor.workerCapabilities...),
		SupportedToolActionTypes: []string{
			descriptor.toolActionType,
		},
		SupportedEvidenceKinds: []string{
			descriptor.evidenceKind,
		},
		SupportedApprovalKinds: nil,
		SupportedEventTypes: []string{
			"session.created",
			"session.status.changed",
		},
		BoundaryRequirements: []string{
			"tenant_project_scope",
			"runtime_authz",
			"audit_emission",
			"ref_resolved_credentials",
			"gateway_or_direct_provider_boundary",
		},
		TargetEnvironments: []string{
			descriptor.workerTargetEnv,
		},
	}
}
