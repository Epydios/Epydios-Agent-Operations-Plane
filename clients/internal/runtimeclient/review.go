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
	if strings.HasPrefix(typeName, "tool_action.") {
		return ClipText(normalizeInterfaceString(payload["summary"], normalizeInterfaceString(payload["toolType"], "Tool action")), 220)
	}
	return ClipText(normalizeInterfaceString(payload["summary"], normalizeInterfaceString(payload["status"], normalizeInterfaceString(payload["kind"], "Event recorded."))), 220)
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
