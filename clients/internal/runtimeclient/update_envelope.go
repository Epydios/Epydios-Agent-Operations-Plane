package runtimeclient

import (
	"fmt"
	"strings"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type GovernedUpdateEnvelope struct {
	Header               string
	UpdateType           string
	ContextLabel         string
	ContextValue         string
	SubjectLabel         string
	SubjectValue         string
	TaskID               string
	TaskStatus           string
	SessionID            string
	SessionStatus        string
	WorkerID             string
	WorkerType           string
	WorkerState          string
	OpenApprovals        int
	PendingProposalCount int
	ToolActionCount      int
	EvidenceCount        int
	Summary              string
	Details              []string
	Recent               []string
	ActionHints          []string
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
