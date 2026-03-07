package runtimeclient

import (
	"encoding/json"
	"testing"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestParseEventStream(t *testing.T) {
	raw := []byte("id: 1\nevent: worker.output.delta\ndata: {\"eventId\":\"evt-1\",\"sessionId\":\"session-1\",\"sequence\":1,\"eventType\":\"worker.output.delta\",\"payload\":{\"payload\":{\"delta\":\"hello\"}}}\n\nid: 2\nevent: worker.progress\ndata: {\"eventId\":\"evt-2\",\"sessionId\":\"session-1\",\"sequence\":2,\"eventType\":\"worker.progress\",\"payload\":{\"summary\":\"done\"}}\n\n")
	items := ParseEventStream(raw)
	if len(items) != 2 {
		t.Fatalf("len(items)=%d want 2", len(items))
	}
	if items[0].EventID != "evt-1" || items[1].EventID != "evt-2" {
		t.Fatalf("unexpected items: %+v", items)
	}
}

func TestListToolProposals(t *testing.T) {
	generatedPayload, _ := json.Marshal(map[string]interface{}{
		"proposalId":   "proposal-1",
		"proposalType": "terminal_command",
		"summary":      "Run pwd.",
		"payload": map[string]interface{}{
			"command": "pwd",
			"cwd":     "/tmp",
		},
	})
	decidedPayload, _ := json.Marshal(map[string]interface{}{
		"proposalId":   "proposal-1",
		"decision":     "APPROVE",
		"status":       "APPROVED",
		"toolActionId": "action-1",
	})
	timeline := &runtimeapi.SessionTimelineResponse{
		ToolActions: []runtimeapi.ToolActionRecord{{ToolActionID: "action-1", Status: runtimeapi.ToolActionStatusCompleted}},
		Events: []runtimeapi.SessionEventRecord{
			{Sequence: 1, EventType: runtimeapi.SessionEventType("tool_proposal.generated"), Payload: generatedPayload},
			{Sequence: 2, EventType: runtimeapi.SessionEventType("tool_proposal.decided"), Payload: decidedPayload},
		},
	}
	items := ListToolProposals(timeline)
	if len(items) != 1 {
		t.Fatalf("len(items)=%d want 1", len(items))
	}
	if items[0].ProposalID != "proposal-1" {
		t.Fatalf("proposalId=%q", items[0].ProposalID)
	}
	if items[0].ActionStatus != runtimeapi.ToolActionStatusCompleted {
		t.Fatalf("actionStatus=%q", items[0].ActionStatus)
	}
}
