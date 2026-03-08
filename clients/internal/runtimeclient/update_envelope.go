package runtimeclient

import (
	"fmt"
	"strings"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type GovernedUpdateEnvelope struct {
	Header                       string
	UpdateType                   string
	ContextLabel                 string
	ContextValue                 string
	SubjectLabel                 string
	SubjectValue                 string
	TaskID                       string
	TaskStatus                   string
	SessionID                    string
	SessionStatus                string
	WorkerID                     string
	WorkerType                   string
	WorkerState                  string
	OpenApprovals                int
	PendingProposalCount         int
	ToolActionCount              int
	EvidenceCount                int
	Summary                      string
	OrgAdminProfileID            string
	OrgAdminProfileLabel         string
	OrgAdminOrganizationModel    string
	OrgAdminRoleBundle           string
	OrgAdminCategories           []string
	OrgAdminDecisionBindings     []string
	OrgAdminDirectoryMappings    []string
	OrgAdminExceptionProfiles    []string
	OrgAdminOverlayProfiles      []string
	OrgAdminDecisionActorRoles   []string
	OrgAdminDecisionSurfaces     []string
	OrgAdminBoundaryRequirements []string
	OrgAdminInputKeys            []string
	OrgAdminInputValues          []string
	OrgAdminPendingReviews       int
	OrgAdminArtifactEvents       []string
	OrgAdminArtifactEvidence     []string
	OrgAdminArtifactRetention    []string
	Details                      []string
	Recent                       []string
	ActionHints                  []string
}

func RenderGovernedUpdateEnvelope(env GovernedUpdateEnvelope) string {
	lines := []string{NormalizeStringOrDefault(env.Header, "AgentOps governed update")}
	lines = append(lines, fmt.Sprintf("Type: %s", NormalizeStringOrDefault(env.UpdateType, "status")))
	if value := strings.TrimSpace(env.ContextValue); value != "" {
		lines = append(lines, fmt.Sprintf("%s: %s", NormalizeStringOrDefault(env.ContextLabel, "Context"), value))
	}
	if value := strings.TrimSpace(env.SubjectValue); value != "" {
		lines = append(lines, fmt.Sprintf("%s: %s", NormalizeStringOrDefault(env.SubjectLabel, "Subject"), value))
	}
	if strings.TrimSpace(env.TaskID) != "" || strings.TrimSpace(env.TaskStatus) != "" {
		lines = append(lines, fmt.Sprintf("Task: %s (%s)", NormalizeStringOrDefault(env.TaskID, "-"), NormalizeStringOrDefault(env.TaskStatus, "-")))
	}
	if strings.TrimSpace(env.SessionID) != "" || strings.TrimSpace(env.SessionStatus) != "" {
		lines = append(lines, fmt.Sprintf("Session: %s (%s)", NormalizeStringOrDefault(env.SessionID, "-"), NormalizeStringOrDefault(env.SessionStatus, "-")))
	}
	if strings.TrimSpace(env.WorkerID) != "" || strings.TrimSpace(env.WorkerType) != "" || strings.TrimSpace(env.WorkerState) != "" {
		lines = append(lines, fmt.Sprintf("Worker: %s %s %s", NormalizeStringOrDefault(env.WorkerID, "-"), NormalizeStringOrDefault(env.WorkerType, "-"), NormalizeStringOrDefault(env.WorkerState, "-")))
	}
	lines = append(lines, fmt.Sprintf("Open approvals: %d", env.OpenApprovals))
	lines = append(lines, fmt.Sprintf("Pending proposals: %d", env.PendingProposalCount))
	lines = append(lines, fmt.Sprintf("Tool actions: %d", env.ToolActionCount))
	lines = append(lines, fmt.Sprintf("Evidence records: %d", env.EvidenceCount))
	if summary := strings.TrimSpace(env.Summary); summary != "" {
		lines = append(lines, fmt.Sprintf("Summary: %s", summary))
	}
	if env.OrgAdminProfileID != "" || env.OrgAdminProfileLabel != "" {
		lines = append(lines, fmt.Sprintf(
			"Org-admin profile: %s (%s)",
			NormalizeStringOrDefault(env.OrgAdminProfileLabel, env.OrgAdminProfileID),
			NormalizeStringOrDefault(env.OrgAdminProfileID, "-"),
		))
	}
	if env.OrgAdminOrganizationModel != "" {
		lines = append(lines, fmt.Sprintf("Org-admin organization model: %s", env.OrgAdminOrganizationModel))
	}
	if env.OrgAdminRoleBundle != "" {
		lines = append(lines, fmt.Sprintf("Org-admin role bundle: %s", env.OrgAdminRoleBundle))
	}
	if env.OrgAdminPendingReviews > 0 {
		lines = append(lines, fmt.Sprintf("Org-admin pending reviews: %d", env.OrgAdminPendingReviews))
	}
	appendEnvelopeSection(&lines, "Org-admin categories:", env.OrgAdminCategories)
	appendEnvelopeSection(&lines, "Org-admin decision bindings:", env.OrgAdminDecisionBindings)
	appendEnvelopeSection(&lines, "Org-admin directory sync mappings:", env.OrgAdminDirectoryMappings)
	appendEnvelopeSection(&lines, "Org-admin exception profiles:", env.OrgAdminExceptionProfiles)
	appendEnvelopeSection(&lines, "Org-admin overlay profiles:", env.OrgAdminOverlayProfiles)
	appendEnvelopeSection(&lines, "Org-admin decision actor roles:", env.OrgAdminDecisionActorRoles)
	appendEnvelopeSection(&lines, "Org-admin decision surfaces:", env.OrgAdminDecisionSurfaces)
	appendEnvelopeSection(&lines, "Org-admin boundary requirements:", env.OrgAdminBoundaryRequirements)
	appendEnvelopeSection(&lines, "Org-admin input keys:", env.OrgAdminInputKeys)
	appendEnvelopeSection(&lines, "Org-admin input values:", env.OrgAdminInputValues)
	appendEnvelopeSection(&lines, "Org-admin artifact events:", env.OrgAdminArtifactEvents)
	appendEnvelopeSection(&lines, "Org-admin evidence kinds:", env.OrgAdminArtifactEvidence)
	appendEnvelopeSection(&lines, "Org-admin artifact retention classes:", env.OrgAdminArtifactRetention)
	appendEnvelopeSection(&lines, "Details:", env.Details)
	appendEnvelopeSection(&lines, "Recent activity:", env.Recent)
	appendEnvelopeSection(&lines, "Action hints:", env.ActionHints)
	return strings.Join(lines, "\n") + "\n"
}

func RenderEventSummaryLines(items []EventSummary, limit int) []string {
	if len(items) == 0 {
		return nil
	}
	if limit <= 0 || limit > len(items) {
		limit = len(items)
	}
	items = append([]EventSummary(nil), items...)
	if len(items) > limit {
		items = items[len(items)-limit:]
	}
	lines := make([]string, 0, len(items))
	for _, item := range items {
		lines = append(lines, fmt.Sprintf("%s: %s", NormalizeStringOrDefault(item.Label, item.EventType), NormalizeStringOrDefault(item.Detail, "Event recorded.")))
	}
	return lines
}

func MergeEnvelopeLines(groups ...[]string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0)
	for _, group := range groups {
		for _, item := range group {
			trimmed := strings.TrimSpace(item)
			if trimmed == "" {
				continue
			}
			if _, ok := seen[trimmed]; ok {
				continue
			}
			seen[trimmed] = struct{}{}
			out = append(out, trimmed)
		}
	}
	return out
}

func RenderSessionEventLines(items []runtimeapi.SessionEventRecord, limit int) []string {
	if len(items) == 0 {
		return nil
	}
	if limit <= 0 || limit > len(items) {
		limit = len(items)
	}
	items = append([]runtimeapi.SessionEventRecord(nil), items...)
	if len(items) > limit {
		items = items[len(items)-limit:]
	}
	lines := make([]string, 0, len(items))
	for _, item := range items {
		lines = append(lines, fmt.Sprintf("%s: %s", SummarizeEventLabel(string(item.EventType)), SummarizeEventDetail(item)))
	}
	return lines
}

func appendEnvelopeSection(lines *[]string, title string, items []string) {
	normalized := normalizeEnvelopeLines(items)
	if len(normalized) == 0 {
		return
	}
	*lines = append(*lines, title)
	*lines = append(*lines, normalized...)
}

func normalizeEnvelopeLines(items []string) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
			out = append(out, trimmed)
			continue
		}
		out = append(out, "- "+trimmed)
	}
	return out
}
