package runtimeclient

import (
	"fmt"
	"strings"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type ThreadEnvelopeOptions struct {
	Header       string
	UpdateType   string
	ContextLabel string
	ContextValue string
	SubjectLabel string
	SubjectValue string
	Summary      string
	Details      []string
	Recent       []string
	ActionHints  []string
}

func BuildThreadGovernedUpdateEnvelope(view *ThreadReview, options ThreadEnvelopeOptions) GovernedUpdateEnvelope {
	envelope := GovernedUpdateEnvelope{
		Header:       NormalizeStringOrDefault(options.Header, "AgentOps governed update"),
		UpdateType:   NormalizeStringOrDefault(options.UpdateType, "status"),
		ContextLabel: NormalizeStringOrDefault(options.ContextLabel, "Thread"),
		ContextValue: strings.TrimSpace(options.ContextValue),
		SubjectLabel: NormalizeStringOrDefault(options.SubjectLabel, "Task"),
		SubjectValue: strings.TrimSpace(options.SubjectValue),
		Summary:      strings.TrimSpace(options.Summary),
		Details:      append([]string(nil), options.Details...),
		Recent:       append([]string(nil), options.Recent...),
		ActionHints:  append([]string(nil), options.ActionHints...),
	}
	if view == nil {
		return envelope
	}
	envelope.TaskID = normalizeTaskIDFromThreadReview(view)
	envelope.TaskStatus = string(view.Task.Status)
	if envelope.SubjectValue == "" {
		envelope.SubjectValue = NormalizeStringOrDefault(view.Task.Title, envelope.TaskID)
	}
	if timeline := view.Timeline; timeline != nil {
		envelope.SessionID = strings.TrimSpace(timeline.Session.SessionID)
		envelope.SessionStatus = string(timeline.Session.Status)
		envelope.OpenApprovals = timeline.OpenApprovalCount
		envelope.ToolActionCount = len(timeline.ToolActions)
		envelope.EvidenceCount = len(timeline.EvidenceRecords)
		envelope.PendingProposalCount = len(ListToolProposals(timeline))
		if timeline.SelectedWorker != nil {
			envelope.WorkerID = strings.TrimSpace(timeline.SelectedWorker.WorkerID)
			envelope.WorkerType = strings.TrimSpace(timeline.SelectedWorker.WorkerType)
			envelope.WorkerState = string(timeline.SelectedWorker.Status)
		}
		orgAdminReview := BuildOrgAdminReviewProjection(timeline.ApprovalCheckpoints)
		envelope.OrgAdminProfileID = orgAdminReview.ProfileID
		envelope.OrgAdminProfileLabel = orgAdminReview.ProfileLabel
		envelope.OrgAdminOrganizationModel = orgAdminReview.OrganizationModel
		envelope.OrgAdminRoleBundle = orgAdminReview.RoleBundle
		envelope.OrgAdminCategories = append([]string(nil), orgAdminReview.Categories...)
		envelope.OrgAdminDecisionBindings = append([]string(nil), orgAdminReview.BindingLabels...)
		envelope.OrgAdminDirectoryMappings = append([]string(nil), orgAdminReview.DirectoryMappings...)
		envelope.OrgAdminExceptionProfiles = append([]string(nil), orgAdminReview.ExceptionProfiles...)
		envelope.OrgAdminOverlayProfiles = append([]string(nil), orgAdminReview.OverlayProfiles...)
		envelope.OrgAdminDecisionActorRoles = append([]string(nil), orgAdminReview.DecisionActorRoles...)
		envelope.OrgAdminDecisionSurfaces = append([]string(nil), orgAdminReview.DecisionSurfaces...)
		envelope.OrgAdminBoundaryRequirements = append([]string(nil), orgAdminReview.BoundaryRequirements...)
		envelope.OrgAdminInputKeys = append([]string(nil), orgAdminReview.InputKeys...)
		envelope.OrgAdminInputValues = append([]string(nil), orgAdminReview.InputValueLines...)
		envelope.OrgAdminPendingReviews = orgAdminReview.PendingCount
		envelope.Details = MergeEnvelopeLines(envelope.Details, orgAdminReview.Details)
		envelope.ActionHints = MergeEnvelopeLines(envelope.ActionHints, orgAdminReview.ActionHints)
	}
	if len(envelope.Recent) == 0 {
		envelope.Recent = RenderEventSummaryLines(view.RecentEvents, 4)
	}
	return envelope
}

func BuildThreadDecisionActionHints(view *ThreadReview, contextHint, approvalCommand, proposalCommand string) []string {
	return RenderDecisionActionHints(DecisionActionHints{
		ContextHint:     strings.TrimSpace(contextHint),
		ApprovalCommand: approvalCommand,
		ProposalCommand: proposalCommand,
		ApprovalIDs:     PendingApprovalIDsFromThreadReview(view),
		ProposalIDs:     PendingProposalIDsFromThreadReview(view),
	})
}

func BuildThreadContextHint(view *ThreadReview, fallbackTaskID string, parts ...ContextHintPart) string {
	if view != nil && view.Timeline != nil {
		if sessionID := strings.TrimSpace(view.Timeline.Session.SessionID); sessionID != "" {
			parts = append([]ContextHintPart{{Flag: "session-id", Value: sessionID}}, parts...)
		}
	}
	return BuildContextHint(NormalizeStringOrDefault(fallbackTaskID, normalizeTaskIDFromThreadReview(view)), parts...)
}

func PendingApprovalIDsFromThreadReview(view *ThreadReview) []string {
	if view == nil || view.Timeline == nil {
		return nil
	}
	ids := make([]string, 0)
	for _, item := range view.Timeline.ApprovalCheckpoints {
		if strings.EqualFold(string(item.Status), string(runtimeapi.ApprovalStatusPending)) {
			if id := strings.TrimSpace(item.CheckpointID); id != "" {
				ids = append(ids, id)
			}
		}
	}
	return ids
}

func PendingProposalIDsFromThreadReview(view *ThreadReview) []string {
	if view == nil || view.Timeline == nil {
		return nil
	}
	ids := make([]string, 0)
	for _, item := range ListToolProposals(view.Timeline) {
		if strings.EqualFold(NormalizeStringOrDefault(item.Status, "PENDING"), "PENDING") {
			if id := strings.TrimSpace(item.ProposalID); id != "" {
				ids = append(ids, id)
			}
		}
	}
	return ids
}

func BuildThreadFollowSummary(items []runtimeapi.SessionEventRecord) string {
	if len(items) == 0 {
		return "No new native events observed."
	}
	if len(items) == 1 {
		return fmt.Sprintf("Observed 1 new native event: %s", SummarizeEventDetail(items[0]))
	}
	return fmt.Sprintf("Observed %d new native event(s).", len(items))
}

func BuildThreadFollowDetails(items []runtimeapi.SessionEventRecord) []string {
	if len(items) == 0 {
		return nil
	}
	return []string{fmt.Sprintf("New events: %d", len(items))}
}

func normalizeTaskIDFromThreadReview(view *ThreadReview) string {
	if view == nil {
		return ""
	}
	if taskID := strings.TrimSpace(view.Task.TaskID); taskID != "" {
		return taskID
	}
	if view.Timeline != nil {
		if view.Timeline.Task != nil {
			return NormalizeStringOrDefault(view.Timeline.Task.TaskID, view.Timeline.Session.TaskID)
		}
		return NormalizeStringOrDefault(view.Timeline.Session.TaskID, "")
	}
	return ""
}
