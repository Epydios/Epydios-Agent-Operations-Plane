package runtimeclient

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type parityFixture struct {
	Task struct {
		TaskID string `json:"taskId"`
		Title  string `json:"title"`
		Status string `json:"status"`
	} `json:"task"`
	Session struct {
		SessionID        string `json:"sessionId"`
		TaskID           string `json:"taskId"`
		Status           string `json:"status"`
		SelectedWorkerID string `json:"selectedWorkerId"`
	} `json:"session"`
	SelectedWorker struct {
		WorkerID   string `json:"workerId"`
		WorkerType string `json:"workerType"`
		AdapterID  string `json:"adapterId"`
		Status     string `json:"status"`
	} `json:"selectedWorker"`
	PendingApprovals []struct {
		CheckpointID string `json:"checkpointId"`
		Scope        string `json:"scope"`
		Status       string `json:"status"`
	} `json:"pendingApprovals"`
	Events []struct {
		EventID   string                 `json:"eventId"`
		Sequence  int64                  `json:"sequence"`
		EventType string                 `json:"eventType"`
		Payload   map[string]interface{} `json:"payload"`
	} `json:"events"`
	ToolActions []struct {
		ToolActionID  string                 `json:"toolActionId"`
		ToolType      string                 `json:"toolType"`
		Status        string                 `json:"status"`
		ResultPayload map[string]interface{} `json:"resultPayload"`
	} `json:"toolActions"`
	EvidenceRecords []struct {
		EvidenceID string `json:"evidenceId"`
		Kind       string `json:"kind"`
		Summary    string `json:"summary"`
	} `json:"evidenceRecords"`
	Expected struct {
		Summary     string   `json:"summary"`
		EventLines  []string `json:"eventLines"`
		ApprovalIDs []string `json:"approvalIds"`
		ProposalIDs []string `json:"proposalIds"`
	} `json:"expected"`
}

func loadParityFixture(t *testing.T) parityFixture {
	t.Helper()
	path := filepath.Join("..", "..", "testdata", "m19-cross-surface-parity.json")
	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read parity fixture: %v", err)
	}
	var fixture parityFixture
	if err := json.Unmarshal(payload, &fixture); err != nil {
		t.Fatalf("unmarshal parity fixture: %v", err)
	}
	return fixture
}

func buildParityThreadReview(t *testing.T) *ThreadReview {
	t.Helper()
	fixture := loadParityFixture(t)
	task := &runtimeapi.TaskRecord{
		TaskID: fixture.Task.TaskID,
		Title:  fixture.Task.Title,
		Status: runtimeapi.TaskStatus(fixture.Task.Status),
	}
	timeline := &runtimeapi.SessionTimelineResponse{
		Session: runtimeapi.SessionRecord{
			SessionID:        fixture.Session.SessionID,
			TaskID:           fixture.Session.TaskID,
			Status:           runtimeapi.SessionStatus(fixture.Session.Status),
			SelectedWorkerID: fixture.Session.SelectedWorkerID,
		},
		Task: task,
		SelectedWorker: &runtimeapi.SessionWorkerRecord{
			WorkerID:   fixture.SelectedWorker.WorkerID,
			WorkerType: fixture.SelectedWorker.WorkerType,
			AdapterID:  fixture.SelectedWorker.AdapterID,
			Status:     runtimeapi.WorkerStatus(fixture.SelectedWorker.Status),
		},
		OpenApprovalCount: len(fixture.PendingApprovals),
	}
	for _, item := range fixture.PendingApprovals {
		timeline.ApprovalCheckpoints = append(timeline.ApprovalCheckpoints, runtimeapi.ApprovalCheckpointRecord{
			CheckpointID: item.CheckpointID,
			Scope:        item.Scope,
			Status:       runtimeapi.ApprovalStatus(item.Status),
		})
	}
	for idx, item := range fixture.Events {
		payload, _ := json.Marshal(item.Payload)
		timeline.Events = append(timeline.Events, runtimeapi.SessionEventRecord{
			EventID:   item.EventID,
			SessionID: fixture.Session.SessionID,
			Sequence:  item.Sequence,
			EventType: runtimeapi.SessionEventType(item.EventType),
			Payload:   payload,
			Timestamp: time.Unix(int64(idx+1), 0).UTC(),
		})
	}
	for _, item := range fixture.ToolActions {
		resultPayload, _ := json.Marshal(item.ResultPayload)
		timeline.ToolActions = append(timeline.ToolActions, runtimeapi.ToolActionRecord{
			ToolActionID:  item.ToolActionID,
			ToolType:      item.ToolType,
			Status:        runtimeapi.ToolActionStatus(item.Status),
			ResultPayload: resultPayload,
		})
	}
	for _, item := range fixture.EvidenceRecords {
		timeline.EvidenceRecords = append(timeline.EvidenceRecords, runtimeapi.EvidenceRecord{
			EvidenceID: item.EvidenceID,
			SessionID:  fixture.Session.SessionID,
			Kind:       item.Kind,
			URI:        "memory://" + item.EvidenceID,
		})
	}
	return BuildThreadReview(task, []runtimeapi.SessionRecord{timeline.Session}, timeline.Session.SessionID, timeline)
}
