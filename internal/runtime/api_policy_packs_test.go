package runtime

import (
	"net/http"
	"testing"
)

func TestRuntimeV1Alpha2PolicyPackCatalog(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/policy-packs", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET policy packs status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response PolicyPackCatalogResponse
	decodeResponseBody(t, rr, &response)
	if response.Count != len(response.Items) {
		t.Fatalf("catalog count=%d want %d", response.Count, len(response.Items))
	}
	if response.Count < 3 {
		t.Fatalf("catalog count=%d want at least 3", response.Count)
	}

	var sawReadOnly bool
	var sawManaged bool
	for _, item := range response.Items {
		if item.PackID == "read_only_review" {
			sawReadOnly = true
			if len(item.Permissions) != 1 || item.Permissions[0] != PermissionRunRead {
				t.Fatalf("read_only_review permissions=%v", item.Permissions)
			}
			if len(item.RoleBundles) == 0 {
				t.Fatalf("read_only_review role bundles missing: %+v", item)
			}
		}
		if item.PackID == "managed_codex_worker_operator" {
			sawManaged = true
			if len(item.ApplicableExecutionModes) != 1 || item.ApplicableExecutionModes[0] != AgentInvokeExecutionModeManagedCodexWorker {
				t.Fatalf("managed_codex_worker_operator execution modes=%v", item.ApplicableExecutionModes)
			}
			if len(item.ApplicableAdapterIDs) != 1 || item.ApplicableAdapterIDs[0] != "codex" {
				t.Fatalf("managed_codex_worker_operator adapter ids=%v", item.ApplicableAdapterIDs)
			}
			if len(item.DecisionSurfaces) == 0 {
				t.Fatalf("managed_codex_worker_operator decision surfaces missing: %+v", item)
			}
		}
	}
	if !sawReadOnly {
		t.Fatalf("read_only_review pack missing: %+v", response.Items)
	}
	if !sawManaged {
		t.Fatalf("managed_codex_worker_operator pack missing: %+v", response.Items)
	}
}

func TestRuntimeV1Alpha2PolicyPackCatalogFilters(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/policy-packs?executionMode=managed_codex_worker&clientSurface=chatops", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET filtered policy packs status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response PolicyPackCatalogResponse
	decodeResponseBody(t, rr, &response)
	if response.Count != 2 {
		t.Fatalf("filtered count=%d want 2", response.Count)
	}
	var sawReadOnly bool
	var sawManaged bool
	for _, item := range response.Items {
		switch item.PackID {
		case "read_only_review":
			sawReadOnly = true
		case "managed_codex_worker_operator":
			sawManaged = true
			if len(item.ClientSurfaces) == 0 || item.ClientSurfaces[0] == "" {
				t.Fatalf("client surfaces missing: %+v", item)
			}
		}
	}
	if !sawReadOnly || !sawManaged {
		t.Fatalf("filtered packs missing expected entries: %+v", response.Items)
	}
}
