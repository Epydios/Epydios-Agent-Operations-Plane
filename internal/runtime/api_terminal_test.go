package runtime

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func terminalRequestBody(runID, command string) map[string]interface{} {
	return map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "term-req-" + runID,
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"scope": map[string]interface{}{
			"runId":     runID,
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"command": map[string]interface{}{
			"text":              command,
			"cwd":               ".",
			"timeoutSeconds":    15,
			"readOnlyRequested": true,
		},
		"safety": map[string]interface{}{
			"terminalMode":          "interactive_sandbox_only",
			"restrictedHostMode":    "blocked",
			"restrictedHostRequest": false,
		},
		"provenance": map[string]interface{}{
			"source":         "epydios-agentops-desktop-ui",
			"commandTag":     "cmd-test",
			"agentProfileId": "codex",
		},
		"auditLink": map[string]interface{}{
			"event":      "runtime.terminal.command",
			"runId":      runID,
			"providerId": "terminal-session",
		},
	}
}

func TestRuntimeTerminalSessionCreateExecutesCommand(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	seedApprovalRun(t, store, approvalSeed{
		RunID:              "run-terminal-ok",
		Tier:               2,
		PolicyDecision:     "ALLOW",
		PolicyGrantPresent: true,
		Status:             RunStatusPolicyEvaluated,
	})

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/terminal/sessions", terminalRequestBody("run-terminal-ok", "echo runtime-terminal-ok"))
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST terminal sessions status=%d body=%s", rr.Code, rr.Body.String())
	}

	var resp TerminalSessionCreateResponse
	decodeResponseBody(t, rr, &resp)
	if !resp.Applied {
		t.Fatalf("expected applied=true response: %#v", resp)
	}
	if resp.Status != "COMPLETED" {
		t.Fatalf("terminal status=%q, want COMPLETED", resp.Status)
	}
	if resp.Result == nil {
		t.Fatalf("expected terminal result payload")
	}
	if resp.Result.ExitCode != 0 {
		t.Fatalf("terminal exitCode=%d, want 0", resp.Result.ExitCode)
	}
	if !strings.Contains(resp.Result.Output, "runtime-terminal-ok") {
		t.Fatalf("terminal output=%q, want marker", resp.Result.Output)
	}
	if resp.AuditLink.Event != "runtime.terminal.command" {
		t.Fatalf("audit event=%q, want runtime.terminal.command", resp.AuditLink.Event)
	}
	events, err := store.ListSessionEvents(context.Background(), SessionEventListQuery{SessionID: "run-terminal-ok"})
	if err != nil {
		t.Fatalf("list session events: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("session events=%d want 2", len(events))
	}
	if events[0].EventType != SessionEventType("evidence.recorded") {
		t.Fatalf("event[0] type=%q want evidence.recorded", events[0].EventType)
	}
	if events[1].EventType != SessionEventType("tool_action.completed") {
		t.Fatalf("event[1] type=%q want tool_action.completed", events[1].EventType)
	}
	actions, err := store.ListToolActions(context.Background(), ToolActionListQuery{SessionID: "run-terminal-ok"})
	if err != nil {
		t.Fatalf("list tool actions: %v", err)
	}
	if len(actions) != 1 {
		t.Fatalf("tool actions=%d want 1", len(actions))
	}
	if actions[0].Status != ToolActionStatusCompleted {
		t.Fatalf("tool action status=%q want %q", actions[0].Status, ToolActionStatusCompleted)
	}
	evidence, err := store.ListEvidenceRecords(context.Background(), EvidenceRecordListQuery{SessionID: "run-terminal-ok"})
	if err != nil {
		t.Fatalf("list evidence records: %v", err)
	}
	if len(evidence) != 1 {
		t.Fatalf("evidence records=%d want 1", len(evidence))
	}
	if evidence[0].Kind != "tool_output" {
		t.Fatalf("evidence kind=%q want tool_output", evidence[0].Kind)
	}
}

func TestRuntimeTerminalSessionCreateBlocksRestrictedHostRequest(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	seedApprovalRun(t, store, approvalSeed{
		RunID:              "run-terminal-blocked",
		Tier:               2,
		PolicyDecision:     "ALLOW",
		PolicyGrantPresent: true,
		Status:             RunStatusPolicyEvaluated,
	})

	body := terminalRequestBody("run-terminal-blocked", "pwd")
	body["safety"] = map[string]interface{}{
		"terminalMode":          "interactive_sandbox_only",
		"restrictedHostMode":    "blocked",
		"restrictedHostRequest": true,
	}

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/terminal/sessions", body)
	if rr.Code != http.StatusOK {
		t.Fatalf("POST terminal sessions blocked status=%d body=%s", rr.Code, rr.Body.String())
	}

	var resp TerminalSessionCreateResponse
	decodeResponseBody(t, rr, &resp)
	if resp.Applied {
		t.Fatalf("expected applied=false for restricted_host block")
	}
	if resp.Status != "POLICY_BLOCKED" {
		t.Fatalf("terminal blocked status=%q, want POLICY_BLOCKED", resp.Status)
	}
	if !strings.Contains(strings.ToLower(resp.Warning), "restricted_host") {
		t.Fatalf("warning=%q, want restricted_host reason", resp.Warning)
	}
	actions, err := store.ListToolActions(context.Background(), ToolActionListQuery{SessionID: "run-terminal-blocked"})
	if err != nil {
		t.Fatalf("list blocked tool actions: %v", err)
	}
	if len(actions) != 1 {
		t.Fatalf("blocked tool actions=%d want 1", len(actions))
	}
	if actions[0].Status != ToolActionStatusPolicyBlocked {
		t.Fatalf("blocked tool action status=%q want %q", actions[0].Status, ToolActionStatusPolicyBlocked)
	}
}

func TestRuntimeTerminalSessionCreateRejectsDisallowedCommand(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	seedApprovalRun(t, store, approvalSeed{
		RunID:              "run-terminal-cmd-deny",
		Tier:               2,
		PolicyDecision:     "ALLOW",
		PolicyGrantPresent: true,
		Status:             RunStatusPolicyEvaluated,
	})

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/terminal/sessions", terminalRequestBody("run-terminal-cmd-deny", "bash -lc pwd"))
	if rr.Code != http.StatusOK {
		t.Fatalf("POST terminal sessions disallowed command status=%d body=%s", rr.Code, rr.Body.String())
	}

	var resp TerminalSessionCreateResponse
	decodeResponseBody(t, rr, &resp)
	if resp.Applied {
		t.Fatalf("expected applied=false for disallowed command")
	}
	if resp.Status != "POLICY_BLOCKED" {
		t.Fatalf("terminal blocked status=%q, want POLICY_BLOCKED", resp.Status)
	}
	if !strings.Contains(strings.ToLower(resp.Warning), "not allowed") {
		t.Fatalf("warning=%q, want allowlist message", resp.Warning)
	}
}

func TestRuntimeTerminalSessionCreateRequiresExistingRun(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/terminal/sessions", terminalRequestBody("run-missing", "pwd"))
	if rr.Code != http.StatusNotFound {
		t.Fatalf("POST terminal sessions missing run status=%d body=%s", rr.Code, rr.Body.String())
	}

	var apiErr APIError
	decodeResponseBody(t, rr, &apiErr)
	if apiErr.ErrorCode != "RUN_NOT_FOUND" {
		t.Fatalf("errorCode=%q, want RUN_NOT_FOUND", apiErr.ErrorCode)
	}
}
