package runtime

import (
	"net/http"
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
			if item.WorkerType != "managed_agent" {
				t.Fatalf("managed codex workerType=%q want managed_agent", item.WorkerType)
			}
			if len(item.SupportedApprovalKinds) == 0 {
				t.Fatalf("managed codex approval kinds missing: %+v", item)
			}
		}
		if item.ExecutionMode == AgentInvokeExecutionModeRawModelInvoke && item.AdapterID == "openai" {
			sawOpenAI = true
			if item.WorkerType != "model_invoke" {
				t.Fatalf("openai workerType=%q want model_invoke", item.WorkerType)
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
}
