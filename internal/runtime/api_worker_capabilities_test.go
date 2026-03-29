package runtime

import (
	"net/http"
	"reflect"
	"testing"
)

func TestRuntimeV1Alpha2WorkerCapabilitiesCatalog(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/worker-capabilities", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET worker capabilities status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response WorkerCapabilityCatalogResponse
	decodeResponseBody(t, rr, &response)
	if response.Count != len(response.Items) {
		t.Fatalf("catalog count=%d want %d", response.Count, len(response.Items))
	}
	if response.Count < len(defaultAgentProfiles())+1 {
		t.Fatalf("catalog count=%d want at least %d", response.Count, len(defaultAgentProfiles())+1)
	}

	var sawManagedCodex bool
	var sawOpenAI bool
	for _, item := range response.Items {
		if item.ExecutionMode == AgentInvokeExecutionModeManagedCodexWorker && item.AdapterID == "codex" {
			sawManagedCodex = true
			if item.Description != "AgentOps-managed Codex worker turns with explicit capability-grant and tool-proposal approval kinds, governed approval checkpoints, evidence capture, and gateway-bound provider traffic." {
				t.Fatalf("managed codex description=%q", item.Description)
			}
			if item.WorkerType != "managed_agent" {
				t.Fatalf("managed codex workerType=%q want managed_agent", item.WorkerType)
			}
			if !reflect.DeepEqual(item.SupportedApprovalKinds, []string{"tool_proposal", "capability_grant"}) {
				t.Fatalf("managed codex approval kinds=%v", item.SupportedApprovalKinds)
			}
			if !reflect.DeepEqual(item.TargetEnvironments, []string{"codex"}) {
				t.Fatalf("managed codex target environments=%v", item.TargetEnvironments)
			}
		}
		if item.ExecutionMode == AgentInvokeExecutionModeRawModelInvoke && item.AdapterID == "openai" {
			sawOpenAI = true
			if item.Description != "Direct governed model invocation through the runtime integration path without a managed-worker capability-grant approval boundary." {
				t.Fatalf("openai description=%q", item.Description)
			}
			if item.WorkerType != "model_invoke" {
				t.Fatalf("openai workerType=%q want model_invoke", item.WorkerType)
			}
			if len(item.SupportedApprovalKinds) != 0 {
				t.Fatalf("openai approval kinds=%v want none", item.SupportedApprovalKinds)
			}
			if !reflect.DeepEqual(item.TargetEnvironments, []string{"agentops-desktop"}) {
				t.Fatalf("openai target environments=%v", item.TargetEnvironments)
			}
		}
	}
	if !sawManagedCodex {
		t.Fatalf("managed codex catalog entry missing: %+v", response.Items)
	}
	if !sawOpenAI {
		t.Fatalf("openai catalog entry missing: %+v", response.Items)
	}
}

func TestRuntimeV1Alpha2WorkerCapabilitiesFilters(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/worker-capabilities?executionMode=managed_codex_worker&adapterId=codex", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET filtered worker capabilities status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response WorkerCapabilityCatalogResponse
	decodeResponseBody(t, rr, &response)
	if response.Count != 1 {
		t.Fatalf("filtered count=%d want 1", response.Count)
	}
	item := response.Items[0]
	if item.ExecutionMode != AgentInvokeExecutionModeManagedCodexWorker {
		t.Fatalf("executionMode=%q want %q", item.ExecutionMode, AgentInvokeExecutionModeManagedCodexWorker)
	}
	if item.AdapterID != "codex" {
		t.Fatalf("adapterId=%q want codex", item.AdapterID)
	}
	if !reflect.DeepEqual(item.SupportedApprovalKinds, []string{"tool_proposal", "capability_grant"}) {
		t.Fatalf("approval kinds=%v", item.SupportedApprovalKinds)
	}
	if !reflect.DeepEqual(item.TargetEnvironments, []string{"codex"}) {
		t.Fatalf("target environments=%v", item.TargetEnvironments)
	}
}
