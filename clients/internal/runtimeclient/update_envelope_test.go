package runtimeclient

import (
	"strings"
	"testing"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestRenderGovernedUpdateEnvelope(t *testing.T) {
	value := RenderGovernedUpdateEnvelope(GovernedUpdateEnvelope{
		Header:               "AgentOps thread update",
		UpdateType:           "status",
		ContextLabel:         "Conversation",
		ContextValue:         "slack | ops-alerts (C123)",
		SubjectLabel:         "Thread",
		SubjectValue:         "1730.55",
		TaskID:               "task-1",
		TaskStatus:           "IN_PROGRESS",
		SessionID:            "sess-1",
		SessionStatus:        "RUNNING",
		WorkerID:             "worker-1",
		WorkerType:           "managed_agent",
		WorkerState:          "RUNNING",
		OpenApprovals:        1,
		PendingProposalCount: 2,
		ToolActionCount:      3,
		EvidenceCount:        1,
		OrgAdminArtifactEvents: []string{
			"Directory Sync Review: Centralized Enterprise Admin Directory Sync Binding | category=directory_sync | directorySync=centralized_enterprise_admin_directory_sync_mapping | status=PENDING",
		},
		OrgAdminArtifactEvidence: []string{
			"org_admin_directory_sync_request",
		},
		OrgAdminArtifactRetention: []string{
			"standard",
		},
		Summary:     "Governed thread state refreshed.",
		Details:     []string{"Title: Chat task"},
		Recent:      []string{"Worker Progress: Worker collected deployment context."},
		ActionHints: []string{"Approve the pending action."},
	})
	for _, part := range []string{
		"AgentOps thread update",
		"Type: status",
		"Conversation: slack | ops-alerts (C123)",
		"Thread: 1730.55",
		"Summary: Governed thread state refreshed.",
		"Details:",
		"- Title: Chat task",
		"Org-admin artifact events:",
		"- Directory Sync Review: Centralized Enterprise Admin Directory Sync Binding | category=directory_sync | directorySync=centralized_enterprise_admin_directory_sync_mapping | status=PENDING",
		"Org-admin evidence kinds:",
		"- org_admin_directory_sync_request",
		"Org-admin artifact retention classes:",
		"- standard",
		"Recent activity:",
		"- Worker Progress: Worker collected deployment context.",
		"Action hints:",
		"- Approve the pending action.",
	} {
		if !strings.Contains(value, part) {
			t.Fatalf("missing %q in %s", part, value)
		}
	}
}

func TestRenderSessionEventLines(t *testing.T) {
	lines := RenderSessionEventLines([]runtimeapi.SessionEventRecord{
		{EventType: runtimeapi.SessionEventType("worker.progress"), Payload: []byte(`{"summary":"Worker collected deployment context."}`)},
		{EventType: runtimeapi.SessionEventType("tool_proposal.generated"), Payload: []byte(`{"summary":"Tool proposal generated for shell execution."}`)},
		{
			EventType: runtimeapi.SessionEventType("org_admin.directory_sync.requested"),
			Payload:   []byte(`{"bindingLabel":"Centralized Enterprise Admin Directory Sync Binding","category":"directory_sync","selectedDirectorySyncs":["centralized_enterprise_admin_directory_sync_mapping"],"status":"PENDING"}`),
		},
	}, 2)
	if len(lines) != 2 {
		t.Fatalf("lines=%d", len(lines))
	}
	if !strings.Contains(lines[0], "Tool Proposal: Tool proposal generated for shell execution.") {
		t.Fatalf("unexpected line: %s", lines[0])
	}
	if !strings.Contains(lines[1], "Directory Sync Review: Centralized Enterprise Admin Directory Sync Binding | category=directory_sync | directorySync=centralized_enterprise_admin_directory_sync_mapping | status=PENDING") {
		t.Fatalf("unexpected line: %s", lines[1])
	}
}
