package main

import (
	"encoding/json"
	"testing"

	runtimeclient "github.com/Epydios/Epydios-AgentOps-Control-Plane/clients/internal/runtimeclient"
	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestBuildWorkflowAnnotations(t *testing.T) {
	payload := &workflowIntakePayload{
		SourceSystem: "jira",
		TicketID:     "OPS-101",
		TicketURL:    "https://tickets.example/OPS-101",
		Labels:       []string{"incident", "sev2"},
		Annotations:  map[string]interface{}{"priority": "high"},
	}
	annotations := buildWorkflowAnnotations(payload)
	if annotations["sourceSystem"] != "jira" {
		t.Fatalf("sourceSystem=%v", annotations["sourceSystem"])
	}
	if annotations["ticketId"] != "OPS-101" {
		t.Fatalf("ticketId=%v", annotations["ticketId"])
	}
	labels, ok := annotations["labels"].([]string)
	if !ok || len(labels) != 2 {
		t.Fatalf("labels=%T %#v", annotations["labels"], annotations["labels"])
	}
	if annotations["priority"] != "high" {
		t.Fatalf("priority=%v", annotations["priority"])
	}
}

func TestBuildWorkflowStatusReport(t *testing.T) {
	annotations, _ := json.Marshal(map[string]interface{}{
		"sourceSystem": "jira",
		"ticketId":     "OPS-101",
	})
	proposalPayload, _ := json.Marshal(map[string]interface{}{
		"proposalId":   "proposal-1",
		"proposalType": "terminal_command",
		"summary":      "Run pwd.",
		"payload": map[string]interface{}{
			"command": "pwd",
		},
	})
	timeline := &runtimeapi.SessionTimelineResponse{
		Session:             runtimeapi.SessionRecord{SessionID: "sess-1", Status: runtimeapi.SessionStatusAwaitingApproval, SelectedWorkerID: "worker-1"},
		Task:                &runtimeapi.TaskRecord{TaskID: "task-1", Title: "Test task", Status: runtimeapi.TaskStatusInProgress, LatestSessionID: "sess-1", Annotations: annotations},
		SelectedWorker:      &runtimeapi.SessionWorkerRecord{WorkerID: "worker-1", WorkerType: "managed_agent", Status: runtimeapi.WorkerStatusRunning},
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{{CheckpointID: "approval-1", Status: runtimeapi.ApprovalStatusPending}},
		ToolActions:         []runtimeapi.ToolActionRecord{{ToolActionID: "tool-1", ToolType: "managed_agent_turn"}},
		EvidenceRecords:     []runtimeapi.EvidenceRecord{{EvidenceID: "evidence-1"}},
		Events: []runtimeapi.SessionEventRecord{
			{Sequence: 1, EventType: runtimeapi.SessionEventType("tool_proposal.generated"), Payload: proposalPayload},
			{Sequence: 2, EventType: runtimeapi.SessionEventType("worker.progress"), Payload: mustJSON(map[string]interface{}{"summary": "Worker is waiting for approval."})},
		},
		OpenApprovalCount: 1,
	}
	view := &runtimeclient.ThreadReview{Task: *timeline.Task, Timeline: timeline, ToolProposals: runtimeclient.ListToolProposals(timeline), RecentEvents: runtimeclient.SummarizeRecentEvents(timeline.Events, 5)}
	report := buildWorkflowStatusReport(view)
	if report.TicketID != "OPS-101" {
		t.Fatalf("ticketId=%q", report.TicketID)
	}
	if report.OpenApprovals != 1 {
		t.Fatalf("openApprovals=%d", report.OpenApprovals)
	}
	if len(report.PendingProposals) != 1 {
		t.Fatalf("pendingProposals=%d", len(report.PendingProposals))
	}
}

func mustJSON(value interface{}) json.RawMessage {
	payload, _ := json.Marshal(value)
	return payload
}
