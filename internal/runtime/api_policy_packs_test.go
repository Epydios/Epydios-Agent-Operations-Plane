package runtime

import (
	"net/http"
	"reflect"
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
	var sawGoverned bool
	var sawManaged bool
	for _, item := range response.Items {
		if item.PackID == "read_only_review" {
			sawReadOnly = true
			if item.Description != "Review-only access to governed task, session, approval, evidence, and worker state without run submission or execution privileges." {
				t.Fatalf("read_only_review description=%q", item.Description)
			}
			if len(item.Permissions) != 1 || item.Permissions[0] != PermissionRunRead {
				t.Fatalf("read_only_review permissions=%v", item.Permissions)
			}
			if !reflect.DeepEqual(item.RoleBundles, []string{"enterprise.observer", "enterprise.reviewer"}) {
				t.Fatalf("read_only_review role bundles=%v", item.RoleBundles)
			}
			if !reflect.DeepEqual(item.DecisionSurfaces, []string{"review_only"}) {
				t.Fatalf("read_only_review decision surfaces=%v", item.DecisionSurfaces)
			}
			if !reflect.DeepEqual(item.ClientSurfaces, []string{"chat", "vscode", "cli", "workflow", "chatops"}) {
				t.Fatalf("read_only_review client surfaces=%v", item.ClientSurfaces)
			}
			if !reflect.DeepEqual(item.ReportingSurfaces, []string{"update", "delta-update", "report"}) {
				t.Fatalf("read_only_review reporting surfaces=%v", item.ReportingSurfaces)
			}
			if len(item.ApplicableExecutionModes) != 0 || len(item.ApplicableWorkerTypes) != 0 || len(item.ApplicableAdapterIDs) != 0 {
				t.Fatalf("read_only_review attachment should stay generic: %+v", item)
			}
		}
		if item.PackID == "governed_model_invoke_operator" {
			sawGoverned = true
			if item.Description != "Submit direct governed model turns and decide approval checkpoints on the native session contract without managed-worker execution." {
				t.Fatalf("governed_model_invoke_operator description=%q", item.Description)
			}
			if !reflect.DeepEqual(item.RoleBundles, []string{"enterprise.operator", "enterprise.ai_operator"}) {
				t.Fatalf("governed_model_invoke_operator role bundles=%v", item.RoleBundles)
			}
			if !reflect.DeepEqual(item.Permissions, []string{PermissionRunRead, PermissionRunCreate}) {
				t.Fatalf("governed_model_invoke_operator permissions=%v", item.Permissions)
			}
			if !reflect.DeepEqual(item.ApplicableExecutionModes, []string{AgentInvokeExecutionModeRawModelInvoke}) {
				t.Fatalf("governed_model_invoke_operator execution modes=%v", item.ApplicableExecutionModes)
			}
			if !reflect.DeepEqual(item.ApplicableWorkerTypes, []string{"model_invoke"}) {
				t.Fatalf("governed_model_invoke_operator worker types=%v", item.ApplicableWorkerTypes)
			}
			if len(item.ApplicableAdapterIDs) == 0 {
				t.Fatalf("governed_model_invoke_operator adapter ids missing: %+v", item)
			}
			if !reflect.DeepEqual(item.DecisionSurfaces, []string{"governed_turn_submission", "approval_checkpoint"}) {
				t.Fatalf("governed_model_invoke_operator decision surfaces=%v", item.DecisionSurfaces)
			}
			if !reflect.DeepEqual(item.ClientSurfaces, []string{"chat", "vscode", "cli", "workflow", "chatops"}) {
				t.Fatalf("governed_model_invoke_operator client surfaces=%v", item.ClientSurfaces)
			}
			if !reflect.DeepEqual(item.ReportingSurfaces, []string{"update", "delta-update", "report"}) {
				t.Fatalf("governed_model_invoke_operator reporting surfaces=%v", item.ReportingSurfaces)
			}
		}
		if item.PackID == "managed_codex_worker_operator" {
			sawManaged = true
			if item.Description != "Launch, recover, and control a managed Codex worker with governed tool proposals, approvals, tool execution, and evidence capture." {
				t.Fatalf("managed_codex_worker_operator description=%q", item.Description)
			}
			if !reflect.DeepEqual(item.RoleBundles, []string{"enterprise.operator", "enterprise.ai_operator", "enterprise.worker_controller"}) {
				t.Fatalf("managed_codex_worker_operator role bundles=%v", item.RoleBundles)
			}
			if !reflect.DeepEqual(item.Permissions, []string{PermissionRunRead, PermissionRunCreate}) {
				t.Fatalf("managed_codex_worker_operator permissions=%v", item.Permissions)
			}
			if len(item.ApplicableExecutionModes) != 1 || item.ApplicableExecutionModes[0] != AgentInvokeExecutionModeManagedCodexWorker {
				t.Fatalf("managed_codex_worker_operator execution modes=%v", item.ApplicableExecutionModes)
			}
			if !reflect.DeepEqual(item.ApplicableWorkerTypes, []string{"managed_agent"}) {
				t.Fatalf("managed_codex_worker_operator worker types=%v", item.ApplicableWorkerTypes)
			}
			if len(item.ApplicableAdapterIDs) != 1 || item.ApplicableAdapterIDs[0] != "codex" {
				t.Fatalf("managed_codex_worker_operator adapter ids=%v", item.ApplicableAdapterIDs)
			}
			if !reflect.DeepEqual(item.DecisionSurfaces, []string{"managed_worker_launch", "managed_worker_recovery", "approval_checkpoint", "tool_proposal", "governed_tool_action"}) {
				t.Fatalf("managed_codex_worker_operator decision surfaces=%v", item.DecisionSurfaces)
			}
			if !reflect.DeepEqual(item.ClientSurfaces, []string{"chat", "vscode", "cli", "workflow", "chatops"}) {
				t.Fatalf("managed_codex_worker_operator client surfaces=%v", item.ClientSurfaces)
			}
			if !reflect.DeepEqual(item.ReportingSurfaces, []string{"update", "delta-update", "report"}) {
				t.Fatalf("managed_codex_worker_operator reporting surfaces=%v", item.ReportingSurfaces)
			}
		}
	}
	if !sawReadOnly {
		t.Fatalf("read_only_review pack missing: %+v", response.Items)
	}
	if !sawGoverned {
		t.Fatalf("governed_model_invoke_operator pack missing: %+v", response.Items)
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
			if len(item.ApplicableExecutionModes) != 0 || len(item.ApplicableWorkerTypes) != 0 || len(item.ApplicableAdapterIDs) != 0 {
				t.Fatalf("read_only_review filtered attachment=%+v", item)
			}
		case "managed_codex_worker_operator":
			sawManaged = true
			if !reflect.DeepEqual(item.ApplicableExecutionModes, []string{AgentInvokeExecutionModeManagedCodexWorker}) {
				t.Fatalf("managed_codex_worker_operator filtered execution modes=%v", item.ApplicableExecutionModes)
			}
			if !reflect.DeepEqual(item.ApplicableWorkerTypes, []string{"managed_agent"}) {
				t.Fatalf("managed_codex_worker_operator filtered worker types=%v", item.ApplicableWorkerTypes)
			}
			if !reflect.DeepEqual(item.ApplicableAdapterIDs, []string{"codex"}) {
				t.Fatalf("managed_codex_worker_operator filtered adapter ids=%v", item.ApplicableAdapterIDs)
			}
			if !reflect.DeepEqual(item.ClientSurfaces, []string{"chat", "vscode", "cli", "workflow", "chatops"}) {
				t.Fatalf("managed_codex_worker_operator filtered client surfaces=%v", item.ClientSurfaces)
			}
		}
	}
	if !sawReadOnly || !sawManaged {
		t.Fatalf("filtered packs missing expected entries: %+v", response.Items)
	}
}
