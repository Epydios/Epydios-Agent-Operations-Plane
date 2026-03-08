package runtimeclient

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestResolveTaskByAnnotationLookup(t *testing.T) {
	now := time.Now().UTC()
	tasks := []runtimeapi.TaskRecord{
		{
			TaskID:      "task-older",
			UpdatedAt:   now.Add(-1 * time.Hour),
			Annotations: mustJSONRaw(map[string]interface{}{"ingressKind": "ticket_workflow", "sourceSystem": "jira", "ticketId": "OPS-101"}),
		},
		{
			TaskID:      "task-newer",
			UpdatedAt:   now,
			Annotations: mustJSONRaw(map[string]interface{}{"ingressKind": "ticket_workflow", "sourceSystem": "jira", "ticketId": "OPS-101"}),
		},
	}
	client := NewClient(Config{
		RuntimeAPIBaseURL: "http://agentops.test",
		TenantID:          "tenant-local",
		ProjectID:         "project-local",
	})
	client.httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/v1alpha2/runtime/tasks":
			payload, _ := json.Marshal(TaskListResponse{
				Count: len(tasks),
				Limit: 100,
				Items: tasks,
			})
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(string(payload))),
			}, nil
		default:
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader("not found")),
			}, nil
		}
	})}
	task, err := ResolveTaskByAnnotationLookup(context.Background(), client, TaskAnnotationLookup{
		RequiredAnnotations: map[string]string{
			"ingressKind":  "ticket_workflow",
			"sourceSystem": "jira",
			"ticketId":     "OPS-101",
		},
		CaseInsensitiveKeys: map[string]bool{
			"ingressKind":  true,
			"sourceSystem": true,
		},
		MissingLookupMessage: "lookup required",
		NotFoundMessage:      "not found",
	})
	if err != nil {
		t.Fatalf("ResolveTaskByAnnotationLookup err=%v", err)
	}
	if task.TaskID != "task-newer" {
		t.Fatalf("taskId=%q want task-newer", task.TaskID)
	}
}

func TestResolvePendingTarget(t *testing.T) {
	sessionID, targetID, err := ResolvePendingTarget(PendingTargetLookup{
		FallbackSessionID: "sess-1",
		TargetSingular:    "approval",
		TargetPlural:      "approvals",
		ContextLabel:      "workflow context",
		ExplicitFlag:      "checkpoint-id",
		Items: []PendingTargetItem{
			{ID: "approval-1", Label: "runtime.apply"},
		},
	})
	if err != nil {
		t.Fatalf("ResolvePendingTarget err=%v", err)
	}
	if sessionID != "sess-1" || targetID != "approval-1" {
		t.Fatalf("sessionId=%q targetId=%q", sessionID, targetID)
	}
}

func TestRenderDecisionActionHints(t *testing.T) {
	value := strings.Join(RenderDecisionActionHints(DecisionActionHints{
		ContextHint: "--ticket-id OPS-101 --source-system jira",
		ApprovalIDs: []string{"approval-1", "approval-2"},
		ProposalIDs: []string{"proposal-1"},
	}), "\n")
	for _, part := range []string{
		"Choose an approval explicitly: approvals decide --ticket-id OPS-101 --source-system jira --checkpoint-id <id> --decision APPROVE|DENY",
		"Available approval IDs: approval-1, approval-2",
		"Approve or deny the pending proposal: proposals decide --ticket-id OPS-101 --source-system jira --decision APPROVE|DENY",
	} {
		if !strings.Contains(value, part) {
			t.Fatalf("missing %q in %s", part, value)
		}
	}
}

func TestBuildContextHint(t *testing.T) {
	value := BuildContextHint("task-1",
		ContextHintPart{Flag: "thread-id", Value: "1700.55"},
		ContextHintPart{Flag: "source-system", Value: "slack"},
		ContextHintPart{Flag: "channel-id", Value: "C123"},
	)
	if value != "--thread-id 1700.55 --source-system slack --channel-id C123" {
		t.Fatalf("value=%q", value)
	}
}

func mustJSONRaw(value interface{}) json.RawMessage {
	payload, _ := json.Marshal(value)
	return payload
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}
