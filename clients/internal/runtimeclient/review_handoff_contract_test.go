package runtimeclient

import (
	"strings"
	"testing"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestBuildReviewHandoffDetailLines(t *testing.T) {
	lines := BuildReviewHandoffDetailLines(ReviewHandoffSpec{
		SessionID:      "sess-1",
		SessionStatus:  "RUNNING",
		RunID:          "run-7",
		LatestActivity: "Awaiting approval.",
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Scope: "runtime.apply", Status: runtimeapi.ApprovalStatusPending},
			{CheckpointID: "approval-2", Scope: "runtime.read", Status: runtimeapi.ApprovalStatusApproved},
		},
		ToolProposals: []ToolProposalReview{
			{ProposalID: "proposal-1", Status: "PENDING", Summary: "Run pwd"},
			{ProposalID: "proposal-2", Status: "APPROVED", Summary: "Run ls"},
		},
		SessionEvents: []runtimeapi.SessionEventRecord{
			{EventType: runtimeapi.SessionEventType("approval.status.changed"), Payload: mustJSONRaw(map[string]interface{}{"reason": "Approved by operator."})},
			{EventType: runtimeapi.SessionEventType("evidence.recorded"), Payload: mustJSONRaw(map[string]interface{}{"kind": "audit_bundle"})},
		},
		EvidenceRecords: []runtimeapi.EvidenceRecord{
			{EvidenceID: "evidence-1", Kind: "audit_bundle", URI: "memory://evidence-1", CheckpointID: "approval-2", ToolActionID: "tool-7"},
		},
		ContextHint:      "--task-id task-1",
		ApprovalCommand:  "approvals decide",
		ProposalCommand:  "proposals decide",
		ShareInstruction: "Share the handoff summary with the incident owner.",
	})
	rendered := strings.Join(lines, "\n")
	for _, part := range []string{
		"Current decision: Pending approval checkpoint approval-1 (runtime.apply).",
		"Current decision: Pending tool proposal proposal-1 (Run pwd).",
		"Run/session continuity: Run anchor: run-7.",
		"Run/session continuity: Session anchor: sess-1 (RUNNING).",
		"Approval/proposal linkage: Primary decision detail is not unambiguous yet for this governed thread.",
		"Approval/proposal linkage: Pending approval checkpoints: approval-1",
		"Approval/proposal linkage: Resolved approvals: approval-2 (APPROVED)",
		"Approval/proposal linkage: Resolved tool proposals: proposal-2 (APPROVED)",
		"Audit/evidence handoff: Primary evidence destination: latest audit bundle evidence is ready for the current handoff package.",
		"Audit/evidence handoff: Audit continuity: 2 session event(s) captured for sess-1.",
		"Audit/evidence handoff: Approval Decision: Approved by operator.",
		"Audit/evidence handoff: Evidence package: audit_bundle | evidence-1 | memory://evidence-1 | checkpoint=approval-2 | toolAction=tool-7",
		"Next actions: Current approval is focused automatically: approvals decide --task-id task-1 --decision APPROVE|DENY",
		"Next actions: Secondary path: approvals decide --task-id task-1 --checkpoint-id approval-1 --decision APPROVE|DENY",
	} {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in %s", part, rendered)
		}
	}
}

func TestBuildReviewHandoffDetailLinesFocusesSinglePendingDecision(t *testing.T) {
	lines := BuildReviewHandoffDetailLines(ReviewHandoffSpec{
		SessionID:     "sess-1",
		SessionStatus: "RUNNING",
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Scope: "runtime.apply", Status: runtimeapi.ApprovalStatusPending},
		},
		ContextHint:     "--task-id task-1",
		ApprovalCommand: "approvals decide",
	})
	rendered := strings.Join(lines, "\n")
	for _, part := range []string{
		"Current decision: Focused approval checkpoint approval-1 (runtime.apply).",
		"Approval/proposal linkage: Primary decision detail: approval checkpoint approval-1 (runtime.apply) is the current record for this governed thread.",
		"Next actions: Current approval is focused automatically: approvals decide --task-id task-1 --decision APPROVE|DENY",
		"Next actions: Secondary path: approvals decide --task-id task-1 --checkpoint-id approval-1 --decision APPROVE|DENY",
	} {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in %s", part, rendered)
		}
	}
}

func TestBuildReviewHandoffDetailLinesWithoutPendingTargets(t *testing.T) {
	lines := BuildReviewHandoffDetailLines(ReviewHandoffSpec{
		SessionID:       "sess-2",
		SessionStatus:   "COMPLETED",
		LatestActivity:  "Ready for downstream review.",
		EvidenceRecords: []runtimeapi.EvidenceRecord{{EvidenceID: "evidence-9", Kind: "audit_bundle", URI: "memory://evidence-9"}},
	})
	rendered := strings.Join(lines, "\n")
	for _, part := range []string{
		"Current decision: No pending approval checkpoints or tool proposals remain.",
		"Audit/evidence handoff: Primary evidence destination: latest audit bundle evidence is ready for the current handoff package.",
		"Next actions: Share this handoff summary or the governed report when downstream review needs the current proof package.",
	} {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in %s", part, rendered)
		}
	}
}
