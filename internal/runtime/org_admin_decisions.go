package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const orgAdminDecisionBindingAnnotationKey = "orgAdminDecisionBinding"

type orgAdminDecisionBindingAnnotation struct {
	ProfileID                 string     `json:"profileId"`
	ProfileLabel              string     `json:"profileLabel,omitempty"`
	OrganizationModel         string     `json:"organizationModel,omitempty"`
	DelegationModel           string     `json:"delegationModel,omitempty"`
	BindingID                 string     `json:"bindingId"`
	BindingLabel              string     `json:"bindingLabel,omitempty"`
	Category                  string     `json:"category,omitempty"`
	BindingMode               string     `json:"bindingMode,omitempty"`
	HookIDs                   []string   `json:"hookIds,omitempty"`
	DirectorySyncMappings     []string   `json:"directorySyncMappings,omitempty"`
	SelectedDirectoryMappings []string   `json:"selectedDirectorySyncMappings,omitempty"`
	ExceptionProfiles         []string   `json:"exceptionProfiles,omitempty"`
	SelectedExceptionProfiles []string   `json:"selectedExceptionProfiles,omitempty"`
	OverlayProfiles           []string   `json:"overlayProfiles,omitempty"`
	SelectedOverlayProfiles   []string   `json:"selectedOverlayProfiles,omitempty"`
	RoleBundles               []string   `json:"roleBundles,omitempty"`
	SelectedRoleBundle        string     `json:"selectedRoleBundle,omitempty"`
	RequiredInputs            []string   `json:"requiredInputs,omitempty"`
	DecisionSurfaces          []string   `json:"decisionSurfaces,omitempty"`
	BoundaryRequirements      []string   `json:"boundaryRequirements,omitempty"`
	DirectorySyncInputs       []string   `json:"directorySyncInputs,omitempty"`
	ResidencyExceptionInputs  []string   `json:"residencyExceptionInputs,omitempty"`
	LegalHoldExceptionInputs  []string   `json:"legalHoldExceptionInputs,omitempty"`
	QuotaOverlayInputs        []string   `json:"quotaOverlayInputs,omitempty"`
	ChargebackOverlayInputs   []string   `json:"chargebackOverlayInputs,omitempty"`
	RequestedInputKeys        []string   `json:"requestedInputKeys,omitempty"`
	DecisionActorRoles        []string   `json:"decisionActorRoles,omitempty"`
	InputValues               JSONObject `json:"inputValues,omitempty"`
}

func normalizeApprovalCheckpointAnnotations(req ApprovalCheckpointCreateRequest, identity *RuntimeIdentity) (JSONObject, *orgAdminDecisionBindingAnnotation, error) {
	annotations := cloneJSONObject(req.Annotations)
	if annotations == nil {
		annotations = JSONObject{}
	}
	rawBinding, ok := annotations[orgAdminDecisionBindingAnnotationKey]
	if !ok || rawBinding == nil {
		return annotations, nil, nil
	}
	bindingRequest, ok := normalizeJSONObject(rawBinding)
	if !ok {
		return nil, nil, fmt.Errorf("%s must be an object", orgAdminDecisionBindingAnnotationKey)
	}

	profileID := strings.TrimSpace(normalizeInterfaceString(bindingRequest["profileId"], ""))
	bindingID := strings.TrimSpace(normalizeInterfaceString(bindingRequest["bindingId"], ""))
	if profileID == "" || bindingID == "" {
		return nil, nil, fmt.Errorf("%s.profileId and %s.bindingId are required", orgAdminDecisionBindingAnnotationKey, orgAdminDecisionBindingAnnotationKey)
	}

	profile, ok := findOrgAdminCatalogProfile(profileID)
	if !ok {
		return nil, nil, fmt.Errorf("org admin profile %q not found", profileID)
	}
	binding, ok := findOrgAdminDecisionBinding(profile, bindingID)
	if !ok {
		return nil, nil, fmt.Errorf("org admin decision binding %q not found for profile %q", bindingID, profileID)
	}
	selectedRoleBundle := strings.TrimSpace(normalizeInterfaceString(bindingRequest["roleBundle"], ""))
	if selectedRoleBundle != "" && !containsExactString(binding.RoleBundles, selectedRoleBundle) {
		return nil, nil, fmt.Errorf("role bundle %q is not allowed for binding %q", selectedRoleBundle, bindingID)
	}
	if err := authorizeOrgAdminDecisionBinding(identity, binding, selectedRoleBundle); err != nil {
		return nil, nil, err
	}

	selectedDirectoryMappings, err := normalizeSelectedOrgAdminIDs(bindingRequest["directorySyncMappings"], binding.DirectorySyncMappings, "directory sync mapping")
	if err != nil {
		return nil, nil, err
	}
	selectedExceptionProfiles, err := normalizeSelectedOrgAdminIDs(bindingRequest["exceptionProfiles"], binding.ExceptionProfiles, "exception profile")
	if err != nil {
		return nil, nil, err
	}
	selectedOverlayProfiles, err := normalizeSelectedOrgAdminIDs(bindingRequest["overlayProfiles"], binding.OverlayProfiles, "overlay profile")
	if err != nil {
		return nil, nil, err
	}

	inputValues, ok := normalizeJSONObject(bindingRequest["inputValues"])
	if !ok {
		inputValues = JSONObject{}
	}
	normalizedInputValues, requestedInputKeys, err := normalizeOrgAdminDecisionBindingInputValues(binding, inputValues)
	if err != nil {
		return nil, nil, err
	}
	if err := validateOrgAdminDecisionBindingSelections(binding, selectedRoleBundle, selectedDirectoryMappings, selectedExceptionProfiles, selectedOverlayProfiles); err != nil {
		return nil, nil, err
	}

	normalized := &orgAdminDecisionBindingAnnotation{
		ProfileID:                 profile.ProfileID,
		ProfileLabel:              profile.Label,
		OrganizationModel:         profile.OrganizationModel,
		DelegationModel:           profile.DelegationModel,
		BindingID:                 binding.BindingID,
		BindingLabel:              binding.Label,
		Category:                  binding.Category,
		BindingMode:               binding.BindingMode,
		HookIDs:                   sortedUniqueOrgAdminStrings(binding.HookIDs),
		DirectorySyncMappings:     sortedUniqueOrgAdminStrings(binding.DirectorySyncMappings),
		SelectedDirectoryMappings: selectedDirectoryMappings,
		ExceptionProfiles:         sortedUniqueOrgAdminStrings(binding.ExceptionProfiles),
		SelectedExceptionProfiles: selectedExceptionProfiles,
		OverlayProfiles:           sortedUniqueOrgAdminStrings(binding.OverlayProfiles),
		SelectedOverlayProfiles:   selectedOverlayProfiles,
		RoleBundles:               sortedUniqueOrgAdminStrings(binding.RoleBundles),
		SelectedRoleBundle:        selectedRoleBundle,
		RequiredInputs:            sortedUniqueOrgAdminStrings(binding.RequiredInputs),
		DecisionSurfaces:          sortedUniqueOrgAdminStrings(binding.DecisionSurfaces),
		BoundaryRequirements:      sortedUniqueOrgAdminStrings(binding.BoundaryRequirements),
		DirectorySyncInputs:       sortedUniqueOrgAdminStrings(profile.DirectorySyncInputs),
		ResidencyExceptionInputs:  sortedUniqueOrgAdminStrings(profile.ResidencyExceptionInputs),
		LegalHoldExceptionInputs:  sortedUniqueOrgAdminStrings(profile.LegalHoldExceptionInputs),
		QuotaOverlayInputs:        sortedUniqueOrgAdminStrings(profile.QuotaOverlayInputs),
		ChargebackOverlayInputs:   sortedUniqueOrgAdminStrings(profile.ChargebackOverlayInputs),
		RequestedInputKeys:        requestedInputKeys,
		InputValues:               normalizedInputValues,
	}
	if identity != nil {
		normalized.DecisionActorRoles = sortedUniqueOrgAdminStrings(identity.Roles)
	}

	annotations[orgAdminDecisionBindingAnnotationKey] = map[string]interface{}{
		"profileId":                     normalized.ProfileID,
		"profileLabel":                  normalized.ProfileLabel,
		"organizationModel":             normalized.OrganizationModel,
		"delegationModel":               normalized.DelegationModel,
		"bindingId":                     normalized.BindingID,
		"bindingLabel":                  normalized.BindingLabel,
		"category":                      normalized.Category,
		"bindingMode":                   normalized.BindingMode,
		"hookIds":                       normalized.HookIDs,
		"directorySyncMappings":         normalized.DirectorySyncMappings,
		"selectedDirectorySyncMappings": normalized.SelectedDirectoryMappings,
		"exceptionProfiles":             normalized.ExceptionProfiles,
		"selectedExceptionProfiles":     normalized.SelectedExceptionProfiles,
		"overlayProfiles":               normalized.OverlayProfiles,
		"selectedOverlayProfiles":       normalized.SelectedOverlayProfiles,
		"roleBundles":                   normalized.RoleBundles,
		"selectedRoleBundle":            normalized.SelectedRoleBundle,
		"requiredInputs":                normalized.RequiredInputs,
		"decisionSurfaces":              normalized.DecisionSurfaces,
		"boundaryRequirements":          normalized.BoundaryRequirements,
		"directorySyncInputs":           normalized.DirectorySyncInputs,
		"residencyExceptionInputs":      normalized.ResidencyExceptionInputs,
		"legalHoldExceptionInputs":      normalized.LegalHoldExceptionInputs,
		"quotaOverlayInputs":            normalized.QuotaOverlayInputs,
		"chargebackOverlayInputs":       normalized.ChargebackOverlayInputs,
		"requestedInputKeys":            normalized.RequestedInputKeys,
		"decisionActorRoles":            normalized.DecisionActorRoles,
		"inputValues":                   normalized.InputValues,
	}
	return annotations, normalized, nil
}

func extractOrgAdminDecisionBindingAnnotation(raw json.RawMessage) (*orgAdminDecisionBindingAnnotation, bool) {
	if len(raw) == 0 {
		return nil, false
	}
	var annotations map[string]interface{}
	if err := json.Unmarshal(raw, &annotations); err != nil {
		return nil, false
	}
	value, ok := normalizeJSONObject(annotations[orgAdminDecisionBindingAnnotationKey])
	if !ok {
		return nil, false
	}
	return &orgAdminDecisionBindingAnnotation{
		ProfileID:                 strings.TrimSpace(normalizeInterfaceString(value["profileId"], "")),
		ProfileLabel:              strings.TrimSpace(normalizeInterfaceString(value["profileLabel"], "")),
		OrganizationModel:         strings.TrimSpace(normalizeInterfaceString(value["organizationModel"], "")),
		DelegationModel:           strings.TrimSpace(normalizeInterfaceString(value["delegationModel"], "")),
		BindingID:                 strings.TrimSpace(normalizeInterfaceString(value["bindingId"], "")),
		BindingLabel:              strings.TrimSpace(normalizeInterfaceString(value["bindingLabel"], "")),
		Category:                  strings.TrimSpace(normalizeInterfaceString(value["category"], "")),
		BindingMode:               strings.TrimSpace(normalizeInterfaceString(value["bindingMode"], "")),
		HookIDs:                   normalizeStringSlice(value["hookIds"]),
		DirectorySyncMappings:     normalizeStringSlice(value["directorySyncMappings"]),
		SelectedDirectoryMappings: normalizeStringSlice(value["selectedDirectorySyncMappings"]),
		ExceptionProfiles:         normalizeStringSlice(value["exceptionProfiles"]),
		SelectedExceptionProfiles: normalizeStringSlice(value["selectedExceptionProfiles"]),
		OverlayProfiles:           normalizeStringSlice(value["overlayProfiles"]),
		SelectedOverlayProfiles:   normalizeStringSlice(value["selectedOverlayProfiles"]),
		RoleBundles:               normalizeStringSlice(value["roleBundles"]),
		SelectedRoleBundle:        strings.TrimSpace(normalizeInterfaceString(value["selectedRoleBundle"], "")),
		RequiredInputs:            normalizeStringSlice(value["requiredInputs"]),
		DecisionSurfaces:          normalizeStringSlice(value["decisionSurfaces"]),
		BoundaryRequirements:      normalizeStringSlice(value["boundaryRequirements"]),
		DirectorySyncInputs:       normalizeStringSlice(value["directorySyncInputs"]),
		ResidencyExceptionInputs:  normalizeStringSlice(value["residencyExceptionInputs"]),
		LegalHoldExceptionInputs:  normalizeStringSlice(value["legalHoldExceptionInputs"]),
		QuotaOverlayInputs:        normalizeStringSlice(value["quotaOverlayInputs"]),
		ChargebackOverlayInputs:   normalizeStringSlice(value["chargebackOverlayInputs"]),
		RequestedInputKeys:        normalizeStringSlice(value["requestedInputKeys"]),
		DecisionActorRoles:        normalizeStringSlice(value["decisionActorRoles"]),
		InputValues:               normalizeOrgAdminDecisionBindingInputValueObject(value["inputValues"]),
	}, true
}

func authorizeOrgAdminDecisionBinding(identity *RuntimeIdentity, binding OrgAdminDecisionBinding, selectedRoleBundle string) error {
	allowedRoleBundles := sortedUniqueOrgAdminStrings(binding.RoleBundles)
	if selectedRoleBundle != "" {
		allowedRoleBundles = []string{selectedRoleBundle}
	}
	if len(allowedRoleBundles) == 0 || identity == nil {
		return nil
	}
	for _, role := range identity.Roles {
		if containsExactString(allowedRoleBundles, role) {
			return nil
		}
	}
	return fmt.Errorf("%w: org-admin binding requires one of roles=%s", ErrForbidden, strings.Join(allowedRoleBundles, ","))
}

func findOrgAdminCatalogProfile(profileID string) (OrgAdminCatalogEntry, bool) {
	profileID = strings.TrimSpace(profileID)
	for _, item := range defaultOrgAdminCatalog() {
		if item.ProfileID == profileID {
			return item, true
		}
	}
	return OrgAdminCatalogEntry{}, false
}

func findOrgAdminDecisionBinding(profile OrgAdminCatalogEntry, bindingID string) (OrgAdminDecisionBinding, bool) {
	bindingID = strings.TrimSpace(bindingID)
	for _, item := range profile.DecisionBindings {
		if item.BindingID == bindingID {
			return item, true
		}
	}
	return OrgAdminDecisionBinding{}, false
}

func normalizeSelectedOrgAdminIDs(raw interface{}, allowed []string, label string) ([]string, error) {
	items := normalizeStringSlice(raw)
	if len(items) == 0 {
		return nil, nil
	}
	allowed = sortedUniqueOrgAdminStrings(allowed)
	for _, item := range items {
		if !containsExactString(allowed, item) {
			return nil, fmt.Errorf("%s %q is not allowed by the selected org-admin binding", label, item)
		}
	}
	return items, nil
}

func validateOrgAdminDecisionBindingSelections(binding OrgAdminDecisionBinding, selectedRoleBundle string, selectedDirectoryMappings, selectedExceptionProfiles, selectedOverlayProfiles []string) error {
	switch strings.TrimSpace(binding.Category) {
	case "delegated_admin", "directory_sync":
		if len(binding.DirectorySyncMappings) > 0 && len(selectedDirectoryMappings) == 0 {
			return fmt.Errorf("org admin binding %q requires at least one selected directory sync mapping", binding.BindingID)
		}
	case "break_glass":
		if len(binding.RoleBundles) > 0 && strings.TrimSpace(selectedRoleBundle) == "" {
			return fmt.Errorf("org admin binding %q requires an explicit role bundle selection", binding.BindingID)
		}
	case "residency", "legal_hold":
		if len(binding.ExceptionProfiles) > 0 && len(selectedExceptionProfiles) == 0 {
			return fmt.Errorf("org admin binding %q requires at least one selected exception profile", binding.BindingID)
		}
	case "quota", "chargeback":
		if len(binding.OverlayProfiles) > 0 && len(selectedOverlayProfiles) == 0 {
			return fmt.Errorf("org admin binding %q requires at least one selected overlay profile", binding.BindingID)
		}
	}
	return nil
}

func normalizeOrgAdminDecisionBindingInputValues(binding OrgAdminDecisionBinding, raw JSONObject) (JSONObject, []string, error) {
	normalized := normalizeOrgAdminDecisionBindingInputValueObject(raw)
	requestedInputKeys := sortedUniqueOrgAdminStrings(objectKeys(normalized))
	for _, required := range binding.RequiredInputs {
		value := strings.TrimSpace(normalizeInterfaceString(normalized[required], ""))
		if value == "" {
			return nil, nil, fmt.Errorf("org admin binding %q requires input %q", binding.BindingID, required)
		}
		normalized[required] = value
	}
	for key, value := range normalized {
		text := strings.TrimSpace(normalizeInterfaceString(value, ""))
		if text == "" {
			continue
		}
		if strings.Contains(strings.ToLower(strings.TrimSpace(key)), "expiry") {
			parsed, err := time.Parse(time.RFC3339, text)
			if err != nil {
				return nil, nil, fmt.Errorf("org admin binding %q requires %q to be RFC3339", binding.BindingID, key)
			}
			if parsed.UTC().Before(time.Now().UTC()) {
				return nil, nil, fmt.Errorf("org admin binding %q requires %q to be in the future", binding.BindingID, key)
			}
			normalized[key] = parsed.UTC().Format(time.RFC3339)
			continue
		}
		normalized[key] = text
	}
	return normalized, requestedInputKeys, nil
}

func normalizeOrgAdminDecisionBindingInputValueObject(raw interface{}) JSONObject {
	object, ok := normalizeJSONObject(raw)
	if !ok || object == nil {
		return JSONObject{}
	}
	normalized := JSONObject{}
	for key, value := range object {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		text := strings.TrimSpace(normalizeInterfaceString(value, ""))
		if text == "" {
			continue
		}
		normalized[trimmedKey] = text
	}
	return normalized
}

func normalizeStringSlice(raw interface{}) []string {
	switch value := raw.(type) {
	case []string:
		return sortedUniqueOrgAdminStrings(value)
	case []interface{}:
		items := make([]string, 0, len(value))
		for _, item := range value {
			if text := strings.TrimSpace(normalizeInterfaceString(item, "")); text != "" {
				items = append(items, text)
			}
		}
		return sortedUniqueOrgAdminStrings(items)
	default:
		return nil
	}
}

func normalizeJSONObject(raw interface{}) (JSONObject, bool) {
	if raw == nil {
		return nil, false
	}
	switch value := raw.(type) {
	case JSONObject:
		return cloneJSONObject(value), true
	case map[string]interface{}:
		out := JSONObject{}
		for key, entry := range value {
			out[key] = entry
		}
		return out, true
	default:
		return nil, false
	}
}

func objectKeys(value JSONObject) []string {
	if value == nil {
		return nil
	}
	items := make([]string, 0, len(value))
	for key := range value {
		if trimmed := strings.TrimSpace(key); trimmed != "" {
			items = append(items, trimmed)
		}
	}
	return sortedUniqueOrgAdminStrings(items)
}

func normalizeInterfaceString(value interface{}, fallback string) string {
	switch item := value.(type) {
	case string:
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			return trimmed
		}
	case fmt.Stringer:
		if trimmed := strings.TrimSpace(item.String()); trimmed != "" {
			return trimmed
		}
	case json.Number:
		if trimmed := strings.TrimSpace(item.String()); trimmed != "" {
			return trimmed
		}
	case float64, float32, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, bool:
		if trimmed := strings.TrimSpace(fmt.Sprint(item)); trimmed != "" {
			return trimmed
		}
	}
	return strings.TrimSpace(fallback)
}

func appendOrgAdminDecisionBindingRequestedArtifacts(s *APIServer, ctx context.Context, session *SessionRecord, checkpoint *ApprovalCheckpointRecord, binding *orgAdminDecisionBindingAnnotation, now time.Time) {
	if s == nil || session == nil || checkpoint == nil || binding == nil {
		return
	}
	_ = s.store.AppendSessionEvent(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("org_admin.binding.requested"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"checkpointId":         checkpoint.CheckpointID,
			"profileId":            binding.ProfileID,
			"profileLabel":         binding.ProfileLabel,
			"bindingId":            binding.BindingID,
			"bindingLabel":         binding.BindingLabel,
			"category":             binding.Category,
			"bindingMode":          binding.BindingMode,
			"selectedRoleBundle":   binding.SelectedRoleBundle,
			"selectedMappings":     binding.SelectedDirectoryMappings,
			"selectedExceptions":   binding.SelectedExceptionProfiles,
			"selectedOverlays":     binding.SelectedOverlayProfiles,
			"requiredInputs":       binding.RequiredInputs,
			"inputValues":          binding.InputValues,
			"decisionSurfaces":     binding.DecisionSurfaces,
			"boundaryRequirements": binding.BoundaryRequirements,
			"status":               checkpoint.Status,
		}),
		Timestamp: now,
	})
	_ = s.store.UpsertEvidenceRecord(ctx, &EvidenceRecord{
		EvidenceID:     fmt.Sprintf("%s-org-admin-request", checkpoint.CheckpointID),
		SessionID:      session.SessionID,
		CheckpointID:   checkpoint.CheckpointID,
		TenantID:       session.TenantID,
		ProjectID:      session.ProjectID,
		Kind:           "org_admin_binding_request",
		RetentionClass: "standard",
		Metadata: mustMarshalJSON(map[string]interface{}{
			"profileId":                 binding.ProfileID,
			"profileLabel":              binding.ProfileLabel,
			"bindingId":                 binding.BindingID,
			"bindingLabel":              binding.BindingLabel,
			"category":                  binding.Category,
			"bindingMode":               binding.BindingMode,
			"roleBundles":               binding.RoleBundles,
			"selectedRoleBundle":        binding.SelectedRoleBundle,
			"directorySyncMappings":     binding.DirectorySyncMappings,
			"selectedDirectoryMappings": binding.SelectedDirectoryMappings,
			"exceptionProfiles":         binding.ExceptionProfiles,
			"selectedExceptionProfiles": binding.SelectedExceptionProfiles,
			"overlayProfiles":           binding.OverlayProfiles,
			"selectedOverlayProfiles":   binding.SelectedOverlayProfiles,
			"requiredInputs":            binding.RequiredInputs,
			"requestedInputKeys":        binding.RequestedInputKeys,
			"inputValues":               binding.InputValues,
			"decisionSurfaces":          binding.DecisionSurfaces,
			"boundaryRequirements":      binding.BoundaryRequirements,
			"createdAt":                 now.Format(time.RFC3339),
		}),
		CreatedAt: now,
		UpdatedAt: now,
	})
}

func appendOrgAdminDecisionBindingResolvedArtifacts(s *APIServer, ctx context.Context, session *SessionRecord, checkpoint *ApprovalCheckpointRecord, binding *orgAdminDecisionBindingAnnotation, decision string, now time.Time) {
	if s == nil || session == nil || checkpoint == nil || binding == nil {
		return
	}
	_ = s.store.AppendSessionEvent(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("org_admin.binding.decision.applied"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"checkpointId":         checkpoint.CheckpointID,
			"profileId":            binding.ProfileID,
			"bindingId":            binding.BindingID,
			"category":             binding.Category,
			"bindingMode":          binding.BindingMode,
			"decision":             decision,
			"status":               checkpoint.Status,
			"reason":               checkpoint.Reason,
			"selectedRoleBundle":   binding.SelectedRoleBundle,
			"selectedMappings":     binding.SelectedDirectoryMappings,
			"selectedExceptions":   binding.SelectedExceptionProfiles,
			"selectedOverlays":     binding.SelectedOverlayProfiles,
			"inputValues":          binding.InputValues,
			"boundaryRequirements": binding.BoundaryRequirements,
		}),
		Timestamp: now,
	})
	_ = s.store.UpsertEvidenceRecord(ctx, &EvidenceRecord{
		EvidenceID:     fmt.Sprintf("%s-org-admin-decision", checkpoint.CheckpointID),
		SessionID:      session.SessionID,
		CheckpointID:   checkpoint.CheckpointID,
		TenantID:       session.TenantID,
		ProjectID:      session.ProjectID,
		Kind:           "org_admin_binding_decision",
		RetentionClass: "archive",
		Metadata: mustMarshalJSON(map[string]interface{}{
			"profileId":                 binding.ProfileID,
			"profileLabel":              binding.ProfileLabel,
			"bindingId":                 binding.BindingID,
			"bindingLabel":              binding.BindingLabel,
			"category":                  binding.Category,
			"bindingMode":               binding.BindingMode,
			"decision":                  decision,
			"status":                    checkpoint.Status,
			"reason":                    checkpoint.Reason,
			"selectedRoleBundle":        binding.SelectedRoleBundle,
			"selectedDirectoryMappings": binding.SelectedDirectoryMappings,
			"selectedExceptionProfiles": binding.SelectedExceptionProfiles,
			"selectedOverlayProfiles":   binding.SelectedOverlayProfiles,
			"inputValues":               binding.InputValues,
			"reviewedAt":                now.Format(time.RFC3339),
		}),
		CreatedAt: now,
		UpdatedAt: now,
	})
}
