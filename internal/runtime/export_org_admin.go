package runtime

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
)

type runtimeExportOrgAdminSummary struct {
	Profiles           []string
	OrganizationModels []string
	DecisionBindings   []string
	Categories         []string
	RoleBundles        []string
	InputKeys          []string
	InputValues        []string
	DecisionActorRoles []string
	DirectoryMappings  []string
	ExceptionProfiles  []string
	OverlayProfiles    []string
	PendingReviewCount int
	RedactionCount     int
}

func (s runtimeExportOrgAdminSummary) hasData() bool {
	return len(s.Profiles) > 0 ||
		len(s.OrganizationModels) > 0 ||
		len(s.DecisionBindings) > 0 ||
		len(s.Categories) > 0 ||
		len(s.RoleBundles) > 0 ||
		len(s.InputKeys) > 0 ||
		len(s.InputValues) > 0 ||
		len(s.DecisionActorRoles) > 0 ||
		len(s.DirectoryMappings) > 0 ||
		len(s.ExceptionProfiles) > 0 ||
		len(s.OverlayProfiles) > 0 ||
		s.PendingReviewCount > 0
}

func summarizeRuntimeExportOrgAdmin(checkpoints []ApprovalCheckpointRecord) runtimeExportOrgAdminSummary {
	profiles := map[string]struct{}{}
	organizationModels := map[string]struct{}{}
	bindings := map[string]struct{}{}
	categories := map[string]struct{}{}
	roleBundles := map[string]struct{}{}
	inputKeys := map[string]struct{}{}
	inputValues := map[string]struct{}{}
	decisionActorRoles := map[string]struct{}{}
	directoryMappings := map[string]struct{}{}
	exceptionProfiles := map[string]struct{}{}
	overlayProfiles := map[string]struct{}{}
	pendingCount := 0
	redactionCount := 0

	for _, checkpoint := range checkpoints {
		binding, ok := extractOrgAdminDecisionBindingAnnotation(checkpoint.Annotations)
		if !ok || binding == nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(string(checkpoint.Status)), string(ApprovalStatusPending)) {
			pendingCount++
		}
		addRuntimeExportOrgAdminValue(profiles, normalizeStringOrDefault(binding.ProfileLabel, binding.ProfileID))
		addRuntimeExportOrgAdminValue(organizationModels, binding.OrganizationModel)
		addRuntimeExportOrgAdminValue(bindings, normalizeStringOrDefault(binding.BindingLabel, binding.BindingID))
		addRuntimeExportOrgAdminValue(categories, binding.Category)
		addRuntimeExportOrgAdminValue(roleBundles, binding.SelectedRoleBundle)
		for _, item := range binding.RequestedInputKeys {
			addRuntimeExportOrgAdminValue(inputKeys, item)
		}
		for key := range binding.InputValues {
			addRuntimeExportOrgAdminValue(inputKeys, key)
		}
		for key, value := range binding.InputValues {
			redacted, count := redactExportStringWithCount(key+"="+normalizeInterfaceString(value, ""), 0)
			redactionCount += count
			addRuntimeExportOrgAdminValue(inputValues, redacted)
		}
		for _, item := range binding.DecisionActorRoles {
			addRuntimeExportOrgAdminValue(decisionActorRoles, item)
		}
		for _, item := range binding.SelectedDirectoryMappings {
			addRuntimeExportOrgAdminValue(directoryMappings, item)
		}
		for _, item := range binding.SelectedExceptionProfiles {
			addRuntimeExportOrgAdminValue(exceptionProfiles, item)
		}
		for _, item := range binding.SelectedOverlayProfiles {
			addRuntimeExportOrgAdminValue(overlayProfiles, item)
		}
	}

	return runtimeExportOrgAdminSummary{
		Profiles:           runtimeExportOrgAdminValues(profiles),
		OrganizationModels: runtimeExportOrgAdminValues(organizationModels),
		DecisionBindings:   runtimeExportOrgAdminValues(bindings),
		Categories:         runtimeExportOrgAdminValues(categories),
		RoleBundles:        runtimeExportOrgAdminValues(roleBundles),
		InputKeys:          runtimeExportOrgAdminValues(inputKeys),
		InputValues:        runtimeExportOrgAdminValues(inputValues),
		DecisionActorRoles: runtimeExportOrgAdminValues(decisionActorRoles),
		DirectoryMappings:  runtimeExportOrgAdminValues(directoryMappings),
		ExceptionProfiles:  runtimeExportOrgAdminValues(exceptionProfiles),
		OverlayProfiles:    runtimeExportOrgAdminValues(overlayProfiles),
		PendingReviewCount: pendingCount,
		RedactionCount:     redactionCount,
	}
}

func summarizeRuntimeAuditExportOrgAdmin(items []map[string]interface{}) runtimeExportOrgAdminSummary {
	profiles := map[string]struct{}{}
	organizationModels := map[string]struct{}{}
	bindings := map[string]struct{}{}
	categories := map[string]struct{}{}
	roleBundles := map[string]struct{}{}
	inputKeys := map[string]struct{}{}
	inputValues := map[string]struct{}{}
	decisionActorRoles := map[string]struct{}{}
	directoryMappings := map[string]struct{}{}
	exceptionProfiles := map[string]struct{}{}
	overlayProfiles := map[string]struct{}{}
	pendingCount := 0
	redactionCount := 0

	for _, item := range items {
		binding, ok := extractOrgAdminDecisionBindingAnnotationFromMap(item)
		if !ok || binding == nil {
			continue
		}
		eventName := strings.ToLower(normalizeInterfaceString(item["event"], ""))
		if strings.Contains(eventName, "requested") {
			pendingCount++
		}
		addRuntimeExportOrgAdminValue(profiles, normalizeStringOrDefault(binding.ProfileLabel, binding.ProfileID))
		addRuntimeExportOrgAdminValue(organizationModels, binding.OrganizationModel)
		addRuntimeExportOrgAdminValue(bindings, normalizeStringOrDefault(binding.BindingLabel, binding.BindingID))
		addRuntimeExportOrgAdminValue(categories, binding.Category)
		addRuntimeExportOrgAdminValue(roleBundles, binding.SelectedRoleBundle)
		for _, value := range binding.RequestedInputKeys {
			addRuntimeExportOrgAdminValue(inputKeys, value)
		}
		for key := range binding.InputValues {
			addRuntimeExportOrgAdminValue(inputKeys, key)
		}
		for key, value := range binding.InputValues {
			redacted, count := redactExportStringWithCount(key+"="+normalizeInterfaceString(value, ""), 0)
			redactionCount += count
			addRuntimeExportOrgAdminValue(inputValues, redacted)
		}
		for _, value := range binding.DecisionActorRoles {
			addRuntimeExportOrgAdminValue(decisionActorRoles, value)
		}
		for _, value := range binding.SelectedDirectoryMappings {
			addRuntimeExportOrgAdminValue(directoryMappings, value)
		}
		for _, value := range binding.SelectedExceptionProfiles {
			addRuntimeExportOrgAdminValue(exceptionProfiles, value)
		}
		for _, value := range binding.SelectedOverlayProfiles {
			addRuntimeExportOrgAdminValue(overlayProfiles, value)
		}
	}

	return runtimeExportOrgAdminSummary{
		Profiles:           runtimeExportOrgAdminValues(profiles),
		OrganizationModels: runtimeExportOrgAdminValues(organizationModels),
		DecisionBindings:   runtimeExportOrgAdminValues(bindings),
		Categories:         runtimeExportOrgAdminValues(categories),
		RoleBundles:        runtimeExportOrgAdminValues(roleBundles),
		InputKeys:          runtimeExportOrgAdminValues(inputKeys),
		InputValues:        runtimeExportOrgAdminValues(inputValues),
		DecisionActorRoles: runtimeExportOrgAdminValues(decisionActorRoles),
		DirectoryMappings:  runtimeExportOrgAdminValues(directoryMappings),
		ExceptionProfiles:  runtimeExportOrgAdminValues(exceptionProfiles),
		OverlayProfiles:    runtimeExportOrgAdminValues(overlayProfiles),
		PendingReviewCount: pendingCount,
		RedactionCount:     redactionCount,
	}
}

func addRuntimeExportOrgAdminValue(items map[string]struct{}, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	items[trimmed] = struct{}{}
}

func runtimeExportOrgAdminValues(items map[string]struct{}) []string {
	if len(items) == 0 {
		return nil
	}
	out := make([]string, 0, len(items))
	for item := range items {
		out = append(out, item)
	}
	sort.Strings(out)
	return out
}

func applyRuntimeExportOrgAdminHeaders(w http.ResponseWriter, summary runtimeExportOrgAdminSummary) {
	if !summary.hasData() {
		return
	}
	if len(summary.Profiles) > 0 {
		w.Header().Set("X-AgentOps-Org-Admin-Profiles", strconv.Itoa(len(summary.Profiles)))
	}
	if len(summary.DecisionBindings) > 0 {
		w.Header().Set("X-AgentOps-Org-Admin-Bindings", strconv.Itoa(len(summary.DecisionBindings)))
	}
	if len(summary.OrganizationModels) > 0 {
		w.Header().Set("X-AgentOps-Org-Admin-Organization-Models", strings.Join(summary.OrganizationModels, ","))
	}
	if len(summary.RoleBundles) > 0 {
		w.Header().Set("X-AgentOps-Org-Admin-Role-Bundles", strings.Join(summary.RoleBundles, ","))
	}
	if len(summary.Categories) > 0 {
		w.Header().Set("X-AgentOps-Org-Admin-Categories", strings.Join(summary.Categories, ","))
	}
	if len(summary.InputKeys) > 0 {
		w.Header().Set("X-AgentOps-Org-Admin-Input-Keys", strings.Join(summary.InputKeys, ","))
	}
	if len(summary.DecisionActorRoles) > 0 {
		w.Header().Set("X-AgentOps-Org-Admin-Decision-Actor-Roles", strings.Join(summary.DecisionActorRoles, ","))
	}
	if summary.PendingReviewCount > 0 {
		w.Header().Set("X-AgentOps-Org-Admin-Pending-Reviews", strconv.Itoa(summary.PendingReviewCount))
	}
}
