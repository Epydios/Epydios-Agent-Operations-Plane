package runtimeclient

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type ThreadReview struct {
	Task            runtimeapi.TaskRecord               `json:"task"`
	Sessions        []runtimeapi.SessionRecord          `json:"sessions"`
	SelectedSession *runtimeapi.SessionRecord           `json:"selectedSession,omitempty"`
	Timeline        *runtimeapi.SessionTimelineResponse `json:"timeline,omitempty"`
	ToolProposals   []ToolProposalReview                `json:"toolProposals,omitempty"`
	Transcript      *ManagedTranscript                  `json:"transcript,omitempty"`
	RecentEvents    []EventSummary                      `json:"recentEvents,omitempty"`
}

type ToolProposalReview struct {
	ProposalID   string                      `json:"proposalId"`
	Status       string                      `json:"status,omitempty"`
	Decision     string                      `json:"decision,omitempty"`
	Reason       string                      `json:"reason,omitempty"`
	ProposalType string                      `json:"proposalType,omitempty"`
	Summary      string                      `json:"summary,omitempty"`
	Command      string                      `json:"command,omitempty"`
	CWD          string                      `json:"cwd,omitempty"`
	ToolActionID string                      `json:"toolActionId,omitempty"`
	ActionStatus runtimeapi.ToolActionStatus `json:"actionStatus,omitempty"`
	GeneratedAt  string                      `json:"generatedAt,omitempty"`
	ReviewedAt   string                      `json:"reviewedAt,omitempty"`
	Payload      map[string]interface{}      `json:"payload,omitempty"`
}

type ManagedTranscript struct {
	ToolActionID string `json:"toolActionId"`
	Pretty       string `json:"pretty"`
}

type EventSummary struct {
	EventID   string `json:"eventId,omitempty"`
	Sequence  int64  `json:"sequence,omitempty"`
	Timestamp string `json:"timestamp,omitempty"`
	EventType string `json:"eventType,omitempty"`
	Label     string `json:"label,omitempty"`
	Detail    string `json:"detail,omitempty"`
}

type OrgAdminReviewProjection struct {
	ProfileID            string   `json:"profileId,omitempty"`
	ProfileLabel         string   `json:"profileLabel,omitempty"`
	OrganizationModel    string   `json:"organizationModel,omitempty"`
	RoleBundle           string   `json:"roleBundle,omitempty"`
	Categories           []string `json:"categories,omitempty"`
	BindingLabels        []string `json:"bindingLabels,omitempty"`
	InputKeys            []string `json:"inputKeys,omitempty"`
	DirectoryMappings    []string `json:"directoryMappings,omitempty"`
	ExceptionProfiles    []string `json:"exceptionProfiles,omitempty"`
	OverlayProfiles      []string `json:"overlayProfiles,omitempty"`
	DecisionActorRoles   []string `json:"decisionActorRoles,omitempty"`
	DecisionSurfaces     []string `json:"decisionSurfaces,omitempty"`
	BoundaryRequirements []string `json:"boundaryRequirements,omitempty"`
	InputValueLines      []string `json:"inputValueLines,omitempty"`
	PendingCount         int      `json:"pendingCount,omitempty"`
	Details              []string `json:"details,omitempty"`
	ActionHints          []string `json:"actionHints,omitempty"`
}

type orgAdminDecisionBindingProjection struct {
	CheckpointID              string
	Status                    string
	Reason                    string
	ProfileID                 string
	ProfileLabel              string
	OrganizationModel         string
	BindingID                 string
	BindingLabel              string
	Category                  string
	BindingMode               string
	SelectedRoleBundle        string
	SelectedDirectoryMappings []string
	SelectedExceptionProfiles []string
	SelectedOverlayProfiles   []string
	RequiredInputs            []string
	RequestedInputKeys        []string
	DecisionActorRoles        []string
	DecisionSurfaces          []string
	BoundaryRequirements      []string
	InputValues               map[string]string
}

func BuildThreadReview(task *runtimeapi.TaskRecord, sessions []runtimeapi.SessionRecord, selectedSessionID string, timeline *runtimeapi.SessionTimelineResponse) *ThreadReview {
	view := &ThreadReview{}
	if task != nil {
		view.Task = *task
	}
	view.Sessions = append([]runtimeapi.SessionRecord(nil), sessions...)
	if timeline != nil {
		view.Timeline = timeline
		sessionCopy := timeline.Session
		view.SelectedSession = &sessionCopy
		view.ToolProposals = ListToolProposals(timeline)
		view.Transcript = ExtractManagedTranscript(timeline)
		view.RecentEvents = SummarizeRecentEvents(timeline.Events, 12)
		return view
	}
	selectedSessionID = strings.TrimSpace(selectedSessionID)
	for _, item := range sessions {
		if item.SessionID == selectedSessionID {
			sessionCopy := item
			view.SelectedSession = &sessionCopy
			break
		}
	}
	if view.SelectedSession == nil && len(sessions) > 0 {
		sessionCopy := sessions[0]
		view.SelectedSession = &sessionCopy
	}
	return view
}

func SummarizeRecentEvents(events []runtimeapi.SessionEventRecord, limit int) []EventSummary {
	if limit <= 0 {
		limit = 10
	}
	items := append([]runtimeapi.SessionEventRecord(nil), events...)
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Sequence == items[j].Sequence {
			return items[i].Timestamp.Before(items[j].Timestamp)
		}
		return items[i].Sequence < items[j].Sequence
	})
	if len(items) > limit {
		items = items[len(items)-limit:]
	}
	out := make([]EventSummary, 0, len(items))
	for _, item := range items {
		out = append(out, EventSummary{
			EventID:   strings.TrimSpace(item.EventID),
			Sequence:  item.Sequence,
			Timestamp: item.Timestamp.UTC().Format(time.RFC3339),
			EventType: string(item.EventType),
			Label:     SummarizeEventLabel(string(item.EventType)),
			Detail:    SummarizeEventDetail(item),
		})
	}
	return out
}

func SummarizeEventLabel(eventType string) string {
	switch strings.ToLower(strings.TrimSpace(eventType)) {
	case "worker.bridge.started":
		return "Worker Bridge"
	case "worker.output.delta":
		return "Worker Output"
	case "worker.progress":
		return "Worker Progress"
	case "worker.heartbeat":
		return "Worker Heartbeat"
	case "worker.status.changed":
		return "Worker Status"
	case "tool_proposal.generated":
		return "Tool Proposal"
	case "tool_proposal.decided":
		return "Proposal Decision"
	case "approval.requested":
		return "Approval Requested"
	case "approval.status.changed":
		return "Approval Decision"
	case "evidence.recorded":
		return "Evidence Recorded"
	}
	if label, ok := orgAdminEventLabel(strings.ToLower(strings.TrimSpace(eventType))); ok {
		return label
	}
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(eventType)), "tool_action.") {
		return "Tool Action"
	}
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(eventType)), "session.") {
		return "Session"
	}
	return NormalizeStringOrDefault(eventType, "Session Event")
}

func SummarizeEventDetail(item runtimeapi.SessionEventRecord) string {
	payload := rawObject(item.Payload)
	nested := nestedPayload(payload)
	typeName := strings.ToLower(strings.TrimSpace(string(item.EventType)))
	switch typeName {
	case "worker.output.delta":
		return ClipText(normalizeInterfaceString(nested["delta"], normalizeInterfaceString(payload["summary"], "Worker emitted output.")), 320)
	case "worker.progress":
		return ClipText(normalizeInterfaceString(payload["summary"], normalizeInterfaceString(payload["status"], "Worker progress updated.")), 220)
	case "tool_proposal.generated":
		return ClipText(normalizeInterfaceString(payload["summary"], normalizeInterfaceString(nested["command"], "Tool proposal generated.")), 320)
	case "tool_proposal.decided":
		return ClipText(normalizeInterfaceString(payload["reason"], normalizeInterfaceString(payload["decision"], normalizeInterfaceString(payload["status"], "Proposal decision"))), 220)
	case "approval.requested", "approval.status.changed":
		return ClipText(normalizeInterfaceString(payload["reason"], normalizeInterfaceString(payload["status"], normalizeInterfaceString(payload["scope"], "Approval event"))), 220)
	case "evidence.recorded":
		return ClipText(normalizeInterfaceString(payload["kind"], normalizeInterfaceString(payload["evidenceId"], "Evidence recorded.")), 220)
	}
	if detail, ok := summarizeOrgAdminEventDetail(typeName, payload); ok {
		return detail
	}
	if strings.HasPrefix(typeName, "tool_action.") {
		return ClipText(normalizeInterfaceString(payload["summary"], normalizeInterfaceString(payload["toolType"], "Tool action")), 220)
	}
	return ClipText(normalizeInterfaceString(payload["summary"], normalizeInterfaceString(payload["status"], normalizeInterfaceString(payload["kind"], "Event recorded."))), 220)
}

func orgAdminEventLabel(eventType string) (string, bool) {
	switch eventType {
	case "org_admin.delegated_admin.requested", "org_admin.delegated_admin.decision.applied":
		return "Delegated Admin Review", true
	case "org_admin.break_glass.requested", "org_admin.break_glass.decision.applied":
		return "Break-Glass Review", true
	case "org_admin.directory_sync.requested", "org_admin.directory_sync.decision.applied":
		return "Directory Sync Review", true
	case "org_admin.residency_exception.requested", "org_admin.residency_exception.decision.applied":
		return "Residency Exception Review", true
	case "org_admin.legal_hold_exception.requested", "org_admin.legal_hold_exception.decision.applied":
		return "Legal Hold Review", true
	case "org_admin.quota_overlay.requested", "org_admin.quota_overlay.decision.applied":
		return "Quota Overlay Review", true
	case "org_admin.chargeback_overlay.requested", "org_admin.chargeback_overlay.decision.applied":
		return "Chargeback Overlay Review", true
	default:
		return "", false
	}
}

func summarizeOrgAdminEventDetail(eventType string, payload map[string]interface{}) (string, bool) {
	if !strings.HasPrefix(eventType, "org_admin.") {
		return "", false
	}
	label, ok := orgAdminEventLabel(eventType)
	if !ok {
		return "", false
	}
	binding := normalizeInterfaceString(payload["bindingLabel"], normalizeInterfaceString(payload["bindingId"], label))
	category := normalizeInterfaceString(payload["category"], "")
	status := normalizeInterfaceString(payload["status"], "")
	decision := normalizeInterfaceString(payload["decision"], "")

	var fragments []string
	if binding != "" {
		fragments = append(fragments, binding)
	}
	if category != "" {
		fragments = append(fragments, "category="+category)
	}
	if roleBundle := normalizeInterfaceString(payload["selectedRoleBundle"], ""); roleBundle != "" {
		fragments = append(fragments, "roleBundle="+roleBundle)
	}
	if selected := normalizeEventStringSlice(payload["selectedDirectorySyncs"]); len(selected) > 0 {
		fragments = append(fragments, "directorySync="+strings.Join(selected, ","))
	}
	if selected := normalizeEventStringSlice(payload["selectedExceptions"]); len(selected) > 0 {
		fragments = append(fragments, "exceptions="+strings.Join(selected, ","))
	}
	if selected := normalizeEventStringSlice(payload["selectedOverlays"]); len(selected) > 0 {
		fragments = append(fragments, "overlays="+strings.Join(selected, ","))
	}
	if decision != "" {
		fragments = append(fragments, "decision="+decision)
	}
	if status != "" {
		fragments = append(fragments, "status="+status)
	}
	if len(fragments) == 0 {
		return label, true
	}
	return ClipText(strings.Join(fragments, " | "), 320), true
}

func normalizeEventStringSlice(raw interface{}) []string {
	switch value := raw.(type) {
	case []string:
		return sortedUniqueStrings(value)
	case []interface{}:
		items := make([]string, 0, len(value))
		for _, item := range value {
			if text := strings.TrimSpace(normalizeInterfaceString(item, "")); text != "" {
				items = append(items, text)
			}
		}
		return sortedUniqueStrings(items)
	default:
		return nil
	}
}

func ListToolProposals(timeline *runtimeapi.SessionTimelineResponse) []ToolProposalReview {
	if timeline == nil {
		return nil
	}
	proposals := map[string]*ToolProposalReview{}
	toolActionsByID := map[string]runtimeapi.ToolActionRecord{}
	for _, item := range timeline.ToolActions {
		toolActionsByID[strings.TrimSpace(item.ToolActionID)] = item
	}
	events := append([]runtimeapi.SessionEventRecord(nil), timeline.Events...)
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].Sequence == events[j].Sequence {
			return events[i].Timestamp.Before(events[j].Timestamp)
		}
		return events[i].Sequence < events[j].Sequence
	})
	for _, item := range events {
		payload := rawObject(item.Payload)
		switch string(item.EventType) {
		case "tool_proposal.generated":
			proposalID := normalizeInterfaceString(payload["proposalId"], "")
			if proposalID == "" {
				continue
			}
			proposalPayload := nestedPayload(payload)
			proposals[proposalID] = &ToolProposalReview{
				ProposalID:   proposalID,
				Status:       "PENDING",
				ProposalType: normalizeInterfaceString(payload["proposalType"], ""),
				Summary:      normalizeInterfaceString(payload["summary"], ""),
				Command:      normalizeInterfaceString(proposalPayload["command"], ""),
				CWD:          normalizeInterfaceString(proposalPayload["cwd"], ""),
				GeneratedAt:  item.Timestamp.UTC().Format(time.RFC3339),
				Payload:      proposalPayload,
			}
		case "tool_proposal.decided":
			proposalID := normalizeInterfaceString(payload["proposalId"], "")
			if proposalID == "" {
				continue
			}
			existing := proposals[proposalID]
			if existing == nil {
				existing = &ToolProposalReview{ProposalID: proposalID}
				proposals[proposalID] = existing
			}
			existing.Status = normalizeInterfaceString(payload["status"], existing.Status)
			existing.Decision = normalizeInterfaceString(payload["decision"], existing.Decision)
			existing.Reason = normalizeInterfaceString(payload["reason"], existing.Reason)
			existing.ToolActionID = normalizeInterfaceString(payload["toolActionId"], existing.ToolActionID)
			existing.ReviewedAt = item.Timestamp.UTC().Format(time.RFC3339)
			existing.ProposalType = normalizeInterfaceString(payload["proposalType"], existing.ProposalType)
			existing.Summary = normalizeInterfaceString(payload["summary"], existing.Summary)
		}
	}
	items := make([]ToolProposalReview, 0, len(proposals))
	for _, item := range proposals {
		if action, ok := toolActionsByID[strings.TrimSpace(item.ToolActionID)]; ok {
			item.ActionStatus = action.Status
		}
		items = append(items, *item)
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].GeneratedAt < items[j].GeneratedAt
	})
	return items
}

func ExtractManagedTranscript(timeline *runtimeapi.SessionTimelineResponse) *ManagedTranscript {
	if timeline == nil {
		return nil
	}
	for idx := len(timeline.ToolActions) - 1; idx >= 0; idx-- {
		item := timeline.ToolActions[idx]
		if strings.ToLower(strings.TrimSpace(item.ToolType)) != "managed_agent_turn" {
			continue
		}
		payload := rawObject(item.ResultPayload)
		rawResponse, ok := payload["rawResponse"]
		if !ok || rawResponse == nil {
			continue
		}
		pretty, err := json.MarshalIndent(rawResponse, "", "  ")
		if err != nil {
			continue
		}
		return &ManagedTranscript{ToolActionID: strings.TrimSpace(item.ToolActionID), Pretty: string(pretty)}
	}
	return nil
}

func BuildOrgAdminReviewProjection(approvals []runtimeapi.ApprovalCheckpointRecord) OrgAdminReviewProjection {
	bindings := make([]orgAdminDecisionBindingProjection, 0)
	pendingCount := 0
	bindingLabels := make([]string, 0)
	categories := map[string]struct{}{}
	inputKeys := map[string]struct{}{}
	directoryMappings := map[string]struct{}{}
	exceptionProfiles := map[string]struct{}{}
	overlayProfiles := map[string]struct{}{}
	decisionActorRoles := map[string]struct{}{}
	decisionSurfaces := map[string]struct{}{}
	boundaryRequirements := map[string]struct{}{}
	inputValueLines := map[string]struct{}{}
	for _, item := range approvals {
		value, ok := parseOrgAdminDecisionBinding(item)
		if !ok {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(string(item.Status)), string(runtimeapi.ApprovalStatusPending)) {
			pendingCount++
		}
		if label := NormalizeStringOrDefault(value.BindingLabel, value.BindingID); label != "" {
			bindingLabels = append(bindingLabels, label)
		}
		if trimmed := strings.TrimSpace(value.Category); trimmed != "" {
			categories[trimmed] = struct{}{}
		}
		for _, key := range value.RequestedInputKeys {
			if trimmed := strings.TrimSpace(key); trimmed != "" {
				inputKeys[trimmed] = struct{}{}
			}
		}
		for _, key := range value.SelectedDirectoryMappings {
			if trimmed := strings.TrimSpace(key); trimmed != "" {
				directoryMappings[trimmed] = struct{}{}
			}
		}
		for _, key := range value.SelectedExceptionProfiles {
			if trimmed := strings.TrimSpace(key); trimmed != "" {
				exceptionProfiles[trimmed] = struct{}{}
			}
		}
		for _, key := range value.SelectedOverlayProfiles {
			if trimmed := strings.TrimSpace(key); trimmed != "" {
				overlayProfiles[trimmed] = struct{}{}
			}
		}
		for _, key := range value.DecisionActorRoles {
			if trimmed := strings.TrimSpace(key); trimmed != "" {
				decisionActorRoles[trimmed] = struct{}{}
			}
		}
		for _, key := range value.DecisionSurfaces {
			if trimmed := strings.TrimSpace(key); trimmed != "" {
				decisionSurfaces[trimmed] = struct{}{}
			}
		}
		for _, key := range value.BoundaryRequirements {
			if trimmed := strings.TrimSpace(key); trimmed != "" {
				boundaryRequirements[trimmed] = struct{}{}
			}
		}
		for key, item := range value.InputValues {
			trimmedKey := strings.TrimSpace(key)
			trimmedValue := strings.TrimSpace(item)
			if trimmedKey == "" || trimmedValue == "" {
				continue
			}
			inputValueLines[fmt.Sprintf("%s=%s", trimmedKey, trimmedValue)] = struct{}{}
		}
		bindings = append(bindings, value)
	}
	if len(bindings) == 0 {
		return OrgAdminReviewProjection{}
	}
	primary := bindings[0]
	details := make([]string, 0, len(bindings)*2+6)
	for _, item := range bindings {
		line := NormalizeStringOrDefault(item.BindingLabel, item.BindingID)
		if item.Category != "" {
			line += fmt.Sprintf(" | category=%s", item.Category)
		}
		if item.BindingMode != "" {
			line += fmt.Sprintf(" | mode=%s", item.BindingMode)
		}
		line += fmt.Sprintf(" | status=%s", NormalizeStringOrDefault(item.Status, "PENDING"))
		if item.CheckpointID != "" {
			line += fmt.Sprintf(" | checkpoint=%s", item.CheckpointID)
		}
		details = append(details, "Org-admin decision binding: "+line)
		if item.Reason != "" {
			details = append(details, "Org-admin review reason: "+ClipText(item.Reason, 240))
		}
	}
	if primary.ProfileID != "" || primary.ProfileLabel != "" {
		details = append(details, fmt.Sprintf(
			"Org-admin profile: %s (%s)",
			NormalizeStringOrDefault(primary.ProfileLabel, primary.ProfileID),
			NormalizeStringOrDefault(primary.ProfileID, "-"),
		))
	}
	if primary.SelectedRoleBundle != "" {
		details = append(details, "Org-admin role bundle: "+primary.SelectedRoleBundle)
	}
	if values := sortedUniqueStrings(primary.SelectedDirectoryMappings); len(values) > 0 {
		details = append(details, "Org-admin directory sync mappings: "+strings.Join(values, ", "))
	}
	if values := sortedUniqueStrings(primary.SelectedExceptionProfiles); len(values) > 0 {
		details = append(details, "Org-admin exception profiles: "+strings.Join(values, ", "))
	}
	if values := sortedUniqueStrings(primary.SelectedOverlayProfiles); len(values) > 0 {
		details = append(details, "Org-admin overlay profiles: "+strings.Join(values, ", "))
	}
	if values := sortedUniqueStrings(primary.RequiredInputs); len(values) > 0 {
		details = append(details, "Org-admin required inputs: "+strings.Join(values, ", "))
	}
	if values := sortedUniqueStrings(primary.RequestedInputKeys); len(values) > 0 {
		details = append(details, "Org-admin provided inputs: "+strings.Join(values, ", "))
	}
	if summary := renderOrgAdminInputValues(primary.InputValues); summary != "" {
		details = append(details, "Org-admin input values: "+summary)
	}
	if values := sortedUniqueStrings(primary.DecisionSurfaces); len(values) > 0 {
		details = append(details, "Org-admin decision surfaces: "+strings.Join(values, ", "))
	}
	if values := sortedUniqueStrings(primary.BoundaryRequirements); len(values) > 0 {
		details = append(details, "Org-admin boundary requirements: "+strings.Join(values, ", "))
	}

	hints := make([]string, 0, 3)
	if pendingCount > 0 {
		hints = append(hints, fmt.Sprintf("Resolve %d pending org-admin decision reviews before enterprise handoff.", pendingCount))
	}
	if primary.SelectedRoleBundle != "" {
		hints = append(hints, "Org-admin decision is restricted to role bundle "+primary.SelectedRoleBundle+".")
	}
	if values := sortedUniqueStrings(primary.RequiredInputs); len(values) > 0 {
		hints = append(hints, "Org-admin review requires input coverage for "+strings.Join(values, ", ")+".")
	}
	hints = append(hints, orgAdminCategoryHints(primary)...)

	return OrgAdminReviewProjection{
		ProfileID:            primary.ProfileID,
		ProfileLabel:         primary.ProfileLabel,
		OrganizationModel:    primary.OrganizationModel,
		RoleBundle:           primary.SelectedRoleBundle,
		Categories:           mapKeysSorted(categories),
		BindingLabels:        sortedUniqueStrings(bindingLabels),
		InputKeys:            mapKeysSorted(inputKeys),
		DirectoryMappings:    mapKeysSorted(directoryMappings),
		ExceptionProfiles:    mapKeysSorted(exceptionProfiles),
		OverlayProfiles:      mapKeysSorted(overlayProfiles),
		DecisionActorRoles:   mapKeysSorted(decisionActorRoles),
		DecisionSurfaces:     mapKeysSorted(decisionSurfaces),
		BoundaryRequirements: mapKeysSorted(boundaryRequirements),
		InputValueLines:      mapKeysSorted(inputValueLines),
		PendingCount:         pendingCount,
		Details:              sortedUniqueStrings(details),
		ActionHints:          sortedUniqueStrings(hints),
	}
}

func mapKeysSorted(items map[string]struct{}) []string {
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

func rawObject(raw json.RawMessage) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var out map[string]interface{}
	if err := json.Unmarshal(raw, &out); err != nil || out == nil {
		return map[string]interface{}{}
	}
	return out
}

func nestedPayload(payload map[string]interface{}) map[string]interface{} {
	if nested, ok := payload["payload"].(map[string]interface{}); ok && nested != nil {
		return nested
	}
	return map[string]interface{}{}
}

func normalizeInterfaceString(value interface{}, fallback string) string {
	text := strings.TrimSpace(fmt.Sprintf("%v", value))
	if text == "" || text == "<nil>" {
		return strings.TrimSpace(fallback)
	}
	return text
}

func ClipText(value string, max int) string {
	value = strings.TrimSpace(value)
	if value == "" || max <= 0 {
		return value
	}
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return strings.TrimSpace(string(runes[:max-1])) + "..."
}

func parseOrgAdminDecisionBinding(item runtimeapi.ApprovalCheckpointRecord) (orgAdminDecisionBindingProjection, bool) {
	annotations := rawObject(item.Annotations)
	binding, ok := annotations["orgAdminDecisionBinding"].(map[string]interface{})
	if !ok || binding == nil {
		return orgAdminDecisionBindingProjection{}, false
	}
	return orgAdminDecisionBindingProjection{
		CheckpointID:              strings.TrimSpace(item.CheckpointID),
		Status:                    strings.TrimSpace(string(item.Status)),
		Reason:                    strings.TrimSpace(item.Reason),
		ProfileID:                 normalizeInterfaceString(binding["profileId"], ""),
		ProfileLabel:              normalizeInterfaceString(binding["profileLabel"], ""),
		OrganizationModel:         normalizeInterfaceString(binding["organizationModel"], ""),
		BindingID:                 normalizeInterfaceString(binding["bindingId"], ""),
		BindingLabel:              normalizeInterfaceString(binding["bindingLabel"], ""),
		Category:                  normalizeInterfaceString(binding["category"], ""),
		BindingMode:               normalizeInterfaceString(binding["bindingMode"], ""),
		SelectedRoleBundle:        normalizeInterfaceString(binding["selectedRoleBundle"], ""),
		SelectedDirectoryMappings: normalizeApprovalStringList(binding["selectedDirectorySyncMappings"]),
		SelectedExceptionProfiles: normalizeApprovalStringList(binding["selectedExceptionProfiles"]),
		SelectedOverlayProfiles:   normalizeApprovalStringList(binding["selectedOverlayProfiles"]),
		RequiredInputs:            normalizeApprovalStringList(binding["requiredInputs"]),
		RequestedInputKeys:        normalizeApprovalStringList(binding["requestedInputKeys"]),
		DecisionActorRoles:        normalizeApprovalStringList(binding["decisionActorRoles"]),
		DecisionSurfaces:          normalizeApprovalStringList(binding["decisionSurfaces"]),
		BoundaryRequirements:      normalizeApprovalStringList(binding["boundaryRequirements"]),
		InputValues:               normalizeApprovalStringMap(binding["inputValues"]),
	}, true
}

func normalizeApprovalStringList(value interface{}) []string {
	items, ok := value.([]interface{})
	if !ok {
		switch typed := value.(type) {
		case []string:
			return sortedUniqueStrings(typed)
		default:
			return nil
		}
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if text := normalizeInterfaceString(item, ""); text != "" {
			out = append(out, text)
		}
	}
	return sortedUniqueStrings(out)
}

func normalizeApprovalStringMap(value interface{}) map[string]string {
	object, ok := value.(map[string]interface{})
	if !ok || object == nil {
		return nil
	}
	out := make(map[string]string, len(object))
	for key, item := range object {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		text := normalizeInterfaceString(item, "")
		if text == "" {
			continue
		}
		out[trimmedKey] = text
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func renderOrgAdminInputValues(values map[string]string) string {
	if len(values) == 0 {
		return ""
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s=%s", key, values[key]))
	}
	return ClipText(strings.Join(parts, ", "), 320)
}

func orgAdminCategoryHints(binding orgAdminDecisionBindingProjection) []string {
	category := strings.TrimSpace(binding.Category)
	switch category {
	case "break_glass":
		expiry := strings.TrimSpace(binding.InputValues["break_glass_expiry"])
		if expiry != "" {
			return []string{"Break-glass access stays time-boxed until " + expiry + "."}
		}
		return []string{"Break-glass activation must stay explicitly time-boxed and auditable."}
	case "directory_sync":
		return []string{"Directory-sync reviews change governed group-to-role bindings and should be checked against IdP source data."}
	case "residency":
		return []string{"Residency exceptions should be reviewed against the requested region and export-profile override path."}
	case "legal_hold":
		return []string{"Legal-hold exceptions should be verified against hold case data before export or retention changes are allowed."}
	case "quota":
		return []string{"Quota overlays change governed capacity limits and must stay aligned with metering dimensions."}
	case "chargeback":
		return []string{"Chargeback overlays change allocation boundaries and should be reviewed against the declared billing dimensions."}
	default:
		return nil
	}
}
