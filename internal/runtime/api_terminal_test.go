package runtime

import (
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
