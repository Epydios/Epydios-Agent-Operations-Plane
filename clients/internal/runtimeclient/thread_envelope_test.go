package runtimeclient

import (
	"strings"
	"testing"
)

func TestBuildThreadGovernedUpdateEnvelopeMatchesParityFixture(t *testing.T) {
	view := buildParityThreadReview(t)
	fixture := loadParityFixture(t)
	envelope := BuildThreadGovernedUpdateEnvelope(view, ThreadEnvelopeOptions{
		Header:       "AgentOps thread update",
		UpdateType:   "review",
		ContextLabel: "Thread",
		ContextValue: view.Task.TaskID,
		SubjectLabel: "Task",
		SubjectValue: view.Task.Title,
		Summary:      fixture.Expected.Summary,
		ActionHints:  BuildThreadDecisionActionHints(view, BuildThreadContextHint(view, view.Task.TaskID), "approvals decide", "proposals decide"),
	})
	if envelope.TaskID != fixture.Task.TaskID {
		t.Fatalf("taskId=%q want %q", envelope.TaskID, fixture.Task.TaskID)
	}
	if envelope.SessionID != fixture.Session.SessionID {
		t.Fatalf("sessionId=%q want %q", envelope.SessionID, fixture.Session.SessionID)
	}
	if envelope.PendingProposalCount != len(fixture.Expected.ProposalIDs) {
		t.Fatalf("pendingProposalCount=%d want %d", envelope.PendingProposalCount, len(fixture.Expected.ProposalIDs))
	}
	if envelope.OpenApprovals != len(fixture.Expected.ApprovalIDs) {
		t.Fatalf("openApprovals=%d want %d", envelope.OpenApprovals, len(fixture.Expected.ApprovalIDs))
	}
	rendered := RenderGovernedUpdateEnvelope(envelope)
	for _, part := range append(fixture.Expected.EventLines, "--checkpoint-id <id>", "--decision APPROVE|DENY") {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in %s", part, rendered)
		}
	}
}
