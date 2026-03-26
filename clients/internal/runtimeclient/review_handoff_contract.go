package runtimeclient

import (
	"fmt"
	"strings"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type ReviewHandoffSpec struct {
	SessionID           string
	SessionStatus       string
	RunID               string
	LatestActivity      string
	Route               string
	BoundaryProviderID  string
	LatestToolActionID  string
	LatestToolType      string
	LatestToolStatus    string
	LatestEvidenceID    string
	LatestEvidenceKind  string
	ApprovalCheckpoints []runtimeapi.ApprovalCheckpointRecord
	ToolProposals       []ToolProposalReview
	SessionEvents       []runtimeapi.SessionEventRecord
	EvidenceRecords     []runtimeapi.EvidenceRecord
	ContextHint         string
	ApprovalCommand     string
	ProposalCommand     string
	ShareInstruction    string
	RefreshInstruction  string
	SubjectLabel        string
	SubjectValue        string
	EscalationTarget    string
	PackageTarget       string
}

type ReviewHandoffSections struct {
	CurrentDecision         []string
	RunSessionContinuity    []string
	ApprovalProposalLinkage []string
	AuditEvidenceHandoff    []string
	NextActions             []string
}

func BuildReviewHandoffSections(spec ReviewHandoffSpec) ReviewHandoffSections {
	return ReviewHandoffSections{
		CurrentDecision:         buildCurrentDecisionLines(spec),
		RunSessionContinuity:    buildRunSessionContinuityLines(spec),
		ApprovalProposalLinkage: buildApprovalProposalLinkageLines(spec),
		AuditEvidenceHandoff:    buildAuditEvidenceHandoffLines(spec),
		NextActions:             buildReviewHandoffNextActions(spec),
	}
}

func BuildReviewHandoffDetailLines(spec ReviewHandoffSpec) []string {
	sections := BuildReviewHandoffSections(spec)
	lines := make([]string, 0, 24)
	lines = appendSectionDetailLines(lines, "Current decision", sections.CurrentDecision)
	lines = appendSectionDetailLines(lines, "Run/session continuity", sections.RunSessionContinuity)
	lines = appendSectionDetailLines(lines, "Approval/proposal linkage", sections.ApprovalProposalLinkage)
	lines = appendSectionDetailLines(lines, "Audit/evidence handoff", sections.AuditEvidenceHandoff)
	lines = appendSectionDetailLines(lines, "Next actions", sections.NextActions)
	return lines
}

func appendSectionDetailLines(out []string, label string, items []string) []string {
	for _, item := range items {
		trimmed := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(item), "- "), "* "))
		if trimmed == "" {
			continue
		}
		out = append(out, fmt.Sprintf("%s: %s", label, trimmed))
	}
	return out
}

func buildCurrentDecisionLines(spec ReviewHandoffSpec) []string {
	lines := make([]string, 0, 4)
	pendingApprovalLines := make([]string, 0, 2)
	for _, item := range spec.ApprovalCheckpoints {
		status := NormalizeStringOrDefault(strings.TrimSpace(string(item.Status)), string(runtimeapi.ApprovalStatusPending))
		if strings.EqualFold(status, string(runtimeapi.ApprovalStatusPending)) {
			pendingApprovalLines = append(pendingApprovalLines, fmt.Sprintf("Pending approval checkpoint %s (%s).",
				NormalizeStringOrDefault(strings.TrimSpace(item.CheckpointID), "approval"),
				NormalizeStringOrDefault(strings.TrimSpace(item.Scope), "scope-unspecified"),
			))
		}
	}
	pendingProposalLines := make([]string, 0, 2)
	for _, item := range spec.ToolProposals {
		status := NormalizeStringOrDefault(strings.TrimSpace(item.Status), "PENDING")
		if strings.EqualFold(status, "PENDING") {
			pendingProposalLines = append(pendingProposalLines, fmt.Sprintf("Pending tool proposal %s (%s).",
				NormalizeStringOrDefault(strings.TrimSpace(item.ProposalID), "proposal"),
				NormalizeStringOrDefault(strings.TrimSpace(item.Summary), NormalizeStringOrDefault(strings.TrimSpace(item.Command), "tool proposal")),
			))
		}
	}
	if len(pendingApprovalLines)+len(pendingProposalLines) == 1 {
		if len(pendingApprovalLines) == 1 {
			return []string{strings.Replace(pendingApprovalLines[0], "Pending approval checkpoint", "Focused approval checkpoint", 1)}
		}
		return []string{strings.Replace(pendingProposalLines[0], "Pending tool proposal", "Focused tool proposal", 1)}
	}
	lines = append(lines, pendingApprovalLines...)
	lines = append(lines, pendingProposalLines...)
	if len(lines) == 0 {
		return []string{"No pending approval checkpoints or tool proposals remain."}
	}
	return lines
}

func buildRunSessionContinuityLines(spec ReviewHandoffSpec) []string {
	lines := make([]string, 0, 7)
	if runID := strings.TrimSpace(spec.RunID); runID != "" {
		lines = append(lines, fmt.Sprintf("Run anchor: %s.", runID))
	}
	if sessionID := strings.TrimSpace(spec.SessionID); sessionID != "" || strings.TrimSpace(spec.SessionStatus) != "" {
		lines = append(lines, fmt.Sprintf("Session anchor: %s (%s).",
			NormalizeStringOrDefault(sessionID, "-"),
			NormalizeStringOrDefault(strings.TrimSpace(spec.SessionStatus), "-"),
		))
	}
	if latest := strings.TrimSpace(spec.LatestActivity); latest != "" {
		lines = append(lines, fmt.Sprintf("Latest governed activity: %s", latest))
	}
	if route := strings.TrimSpace(spec.Route); route != "" {
		lines = append(lines, fmt.Sprintf("Execution route: %s", route))
	}
	if boundary := strings.TrimSpace(spec.BoundaryProviderID); boundary != "" {
		lines = append(lines, fmt.Sprintf("Boundary provider: %s", boundary))
	}
	if toolActionID := strings.TrimSpace(spec.LatestToolActionID); toolActionID != "" {
		lines = append(lines, fmt.Sprintf("Latest tool action anchor: %s (%s / %s).",
			toolActionID,
			NormalizeStringOrDefault(strings.TrimSpace(spec.LatestToolType), "tool action"),
			NormalizeStringOrDefault(strings.TrimSpace(spec.LatestToolStatus), "UNKNOWN"),
		))
	}
	if evidenceID := strings.TrimSpace(spec.LatestEvidenceID); evidenceID != "" {
		lines = append(lines, fmt.Sprintf("Latest evidence anchor: %s (%s).",
			evidenceID,
			NormalizeStringOrDefault(strings.TrimSpace(spec.LatestEvidenceKind), "evidence"),
		))
	}
	if len(lines) == 0 {
		return []string{"Continuity anchors are not fully available yet."}
	}
	return lines
}

func buildApprovalProposalLinkageLines(spec ReviewHandoffSpec) []string {
	lines := make([]string, 0, 4)
	pendingApprovalItems := make([]runtimeapi.ApprovalCheckpointRecord, 0)
	pendingApprovals := make([]string, 0)
	resolvedApprovalItems := make([]runtimeapi.ApprovalCheckpointRecord, 0)
	resolvedApprovals := make([]string, 0)
	for _, item := range spec.ApprovalCheckpoints {
		status := NormalizeStringOrDefault(strings.TrimSpace(string(item.Status)), string(runtimeapi.ApprovalStatusPending))
		label := NormalizeStringOrDefault(strings.TrimSpace(item.CheckpointID), "approval")
		if strings.EqualFold(status, string(runtimeapi.ApprovalStatusPending)) {
			pendingApprovalItems = append(pendingApprovalItems, item)
			pendingApprovals = append(pendingApprovals, label)
			continue
		}
		resolvedApprovalItems = append(resolvedApprovalItems, item)
		resolvedApprovals = append(resolvedApprovals, fmt.Sprintf("%s (%s)", label, status))
	}

	pendingProposalItems := make([]ToolProposalReview, 0)
	pendingProposals := make([]string, 0)
	resolvedProposalItems := make([]ToolProposalReview, 0)
	resolvedProposals := make([]string, 0)
	for _, item := range spec.ToolProposals {
		status := NormalizeStringOrDefault(strings.TrimSpace(item.Status), "PENDING")
		label := NormalizeStringOrDefault(strings.TrimSpace(item.ProposalID), "proposal")
		if strings.EqualFold(status, "PENDING") {
			pendingProposalItems = append(pendingProposalItems, item)
			pendingProposals = append(pendingProposals, label)
			continue
		}
		resolvedProposalItems = append(resolvedProposalItems, item)
		resolvedProposals = append(resolvedProposals, fmt.Sprintf("%s (%s)", label, status))
	}
	if line := buildPrimaryDecisionDetailLine(spec, pendingApprovalItems, resolvedApprovalItems, pendingProposalItems, resolvedProposalItems); line != "" {
		lines = append(lines, line)
	}
	if len(pendingApprovals) > 0 {
		lines = append(lines, fmt.Sprintf("Pending approval checkpoints: %s", strings.Join(pendingApprovals, ", ")))
	}
	if len(resolvedApprovals) > 0 {
		lines = append(lines, fmt.Sprintf("Resolved approvals: %s", strings.Join(resolvedApprovals, ", ")))
	}
	if len(pendingProposals) > 0 {
		lines = append(lines, fmt.Sprintf("Pending tool proposals: %s", strings.Join(pendingProposals, ", ")))
	}
	if len(resolvedProposals) > 0 {
		lines = append(lines, fmt.Sprintf("Resolved tool proposals: %s", strings.Join(resolvedProposals, ", ")))
	}
	if len(lines) == 0 {
		return []string{"No approval checkpoints or tool proposals are attached to this session yet."}
	}
	return lines
}

func buildAuditEvidenceHandoffLines(spec ReviewHandoffSpec) []string {
	lines := make([]string, 0, 12)
	packageTarget := normalizedDestinationSentence(spec.PackageTarget, "the current handoff package")
	if len(spec.EvidenceRecords) > 0 {
		latest := spec.EvidenceRecords[len(spec.EvidenceRecords)-1]
		lines = append(lines, fmt.Sprintf("Primary evidence destination: latest %s evidence is ready for %s.",
			friendlyDestinationLabel(latest.Kind, "evidence"),
			packageTarget,
		))
	} else {
		lines = append(lines, fmt.Sprintf("Primary evidence destination is not available yet for %s.", packageTarget))
	}
	if target := strings.TrimSpace(spec.EscalationTarget); target != "" {
		lines = append(lines, fmt.Sprintf("Suggested escalation target: %s.", normalizedDestinationSentence(target, "downstream review")))
	}
	if target := strings.TrimSpace(spec.PackageTarget); target != "" {
		lines = append(lines, fmt.Sprintf("Suggested package target: %s.", normalizedDestinationSentence(target, "the current handoff package")))
	}
	lines = append(lines, fmt.Sprintf("Audit continuity: %d session event(s) captured for %s.",
		len(spec.SessionEvents),
		NormalizeStringOrDefault(strings.TrimSpace(spec.SessionID), "-"),
	))
	for _, item := range renderRelevantAuditEventLines(spec.SessionEvents, 4) {
		lines = append(lines, item)
	}
	if len(spec.EvidenceRecords) == 0 {
		lines = append(lines, "No evidence records captured yet.")
		return lines
	}
	for _, item := range spec.EvidenceRecords {
		parts := []string{
			NormalizeStringOrDefault(strings.TrimSpace(item.Kind), "-"),
			NormalizeStringOrDefault(strings.TrimSpace(item.EvidenceID), "-"),
			NormalizeStringOrDefault(strings.TrimSpace(item.URI), "-"),
		}
		if checkpointID := strings.TrimSpace(item.CheckpointID); checkpointID != "" {
			parts = append(parts, "checkpoint="+checkpointID)
		}
		if toolActionID := strings.TrimSpace(item.ToolActionID); toolActionID != "" {
			parts = append(parts, "toolAction="+toolActionID)
		}
		lines = append(lines, fmt.Sprintf("Evidence package: %s", strings.Join(parts, " | ")))
	}
	return lines
}

func buildPrimaryDecisionDetailLine(
	spec ReviewHandoffSpec,
	pendingApprovals []runtimeapi.ApprovalCheckpointRecord,
	resolvedApprovals []runtimeapi.ApprovalCheckpointRecord,
	pendingProposals []ToolProposalReview,
	resolvedProposals []ToolProposalReview,
) string {
	subject := handoffSubject(spec)
	totalPending := len(pendingApprovals) + len(pendingProposals)
	if totalPending > 1 {
		return fmt.Sprintf("Primary decision detail is not unambiguous yet for %s.", subject)
	}
	if len(pendingApprovals) == 1 {
		item := pendingApprovals[0]
		return fmt.Sprintf("Primary decision detail: approval checkpoint %s (%s) is the current record for %s.",
			NormalizeStringOrDefault(strings.TrimSpace(item.CheckpointID), "approval"),
			NormalizeStringOrDefault(strings.TrimSpace(item.Scope), "scope-unspecified"),
			subject,
		)
	}
	if len(pendingProposals) == 1 {
		item := pendingProposals[0]
		return fmt.Sprintf("Primary decision detail: tool proposal %s is the current record for %s.",
			NormalizeStringOrDefault(strings.TrimSpace(item.ProposalID), "proposal"),
			subject,
		)
	}
	if len(resolvedApprovals) > 0 {
		item := resolvedApprovals[len(resolvedApprovals)-1]
		return fmt.Sprintf("Primary decision detail: approval checkpoint %s (%s) is the latest resolved record for %s.",
			NormalizeStringOrDefault(strings.TrimSpace(item.CheckpointID), "approval"),
			NormalizeStringOrDefault(strings.TrimSpace(string(item.Status)), "UNKNOWN"),
			subject,
		)
	}
	if len(resolvedProposals) > 0 {
		item := resolvedProposals[len(resolvedProposals)-1]
		return fmt.Sprintf("Primary decision detail: tool proposal %s (%s) is the latest resolved record for %s.",
			NormalizeStringOrDefault(strings.TrimSpace(item.ProposalID), "proposal"),
			NormalizeStringOrDefault(strings.TrimSpace(item.Status), "UNKNOWN"),
			subject,
		)
	}
	return ""
}

func handoffSubject(spec ReviewHandoffSpec) string {
	label := strings.TrimSpace(spec.SubjectLabel)
	value := strings.TrimSpace(spec.SubjectValue)
	if label != "" && value != "" {
		return fmt.Sprintf("%s %s", label, value)
	}
	if value != "" {
		return value
	}
	if target := strings.TrimSpace(spec.EscalationTarget); target != "" {
		return normalizedDestinationSentence(target, "this governed thread")
	}
	return "this governed thread"
}

func friendlyDestinationLabel(value string, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	return strings.ReplaceAll(trimmed, "_", " ")
}

func normalizedDestinationSentence(value string, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	return strings.TrimRight(trimmed, ".")
}

func renderRelevantAuditEventLines(items []runtimeapi.SessionEventRecord, limit int) []string {
	if len(items) == 0 {
		return nil
	}
	filtered := make([]runtimeapi.SessionEventRecord, 0, len(items))
	for _, item := range items {
		typeName := strings.ToLower(strings.TrimSpace(string(item.EventType)))
		switch {
		case strings.HasPrefix(typeName, "approval."),
			strings.HasPrefix(typeName, "tool_proposal."),
			strings.HasPrefix(typeName, "tool_action."),
			typeName == "evidence.recorded",
			strings.HasPrefix(typeName, "session."):
			filtered = append(filtered, item)
		}
	}
	return RenderSessionEventLines(filtered, limit)
}

func buildReviewHandoffNextActions(spec ReviewHandoffSpec) []string {
	pendingApprovalIDs := make([]string, 0)
	for _, item := range spec.ApprovalCheckpoints {
		status := NormalizeStringOrDefault(strings.TrimSpace(string(item.Status)), string(runtimeapi.ApprovalStatusPending))
		if strings.EqualFold(status, string(runtimeapi.ApprovalStatusPending)) {
			if id := strings.TrimSpace(item.CheckpointID); id != "" {
				pendingApprovalIDs = append(pendingApprovalIDs, id)
			}
		}
	}
	pendingProposalIDs := make([]string, 0)
	for _, item := range spec.ToolProposals {
		status := NormalizeStringOrDefault(strings.TrimSpace(item.Status), "PENDING")
		if strings.EqualFold(status, "PENDING") {
			if id := strings.TrimSpace(item.ProposalID); id != "" {
				pendingProposalIDs = append(pendingProposalIDs, id)
			}
		}
	}
	if len(pendingApprovalIDs) > 0 || len(pendingProposalIDs) > 0 {
		return RenderDecisionActionHints(DecisionActionHints{
			ContextHint:     strings.TrimSpace(spec.ContextHint),
			ApprovalCommand: spec.ApprovalCommand,
			ProposalCommand: spec.ProposalCommand,
			ApprovalIDs:     pendingApprovalIDs,
			ProposalIDs:     pendingProposalIDs,
		})
	}
	if len(spec.EvidenceRecords) > 0 {
		return []string{NormalizeStringOrDefault(strings.TrimSpace(spec.ShareInstruction), "Share this handoff summary or the governed report when downstream review needs the current proof package.")}
	}
	return []string{NormalizeStringOrDefault(strings.TrimSpace(spec.RefreshInstruction), "Refresh after the next governed turn to capture audit activity and evidence for handoff.")}
}
