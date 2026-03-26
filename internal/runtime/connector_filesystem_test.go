package runtime

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExecuteMCPFilesystemConnectorReadAndList(t *testing.T) {
	rootPath := createFilesystemProofRoot(t)
	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(filesystemConnectorSettingsFixture(rootPath)))
	if err != nil {
		t.Fatalf("parse filesystem connector settings: %v", err)
	}

	readPlan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "filesystem-proof",
			Driver:      connectorDriverMCPFilesystem,
			ToolName:    connectorToolReadText,
			Arguments: JSONObject{
				"path": "notes/alpha.txt",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan(read) error = %v", err)
	}

	readResult, err := executeConnectorPlan(context.Background(), readPlan)
	if err != nil {
		t.Fatalf("executeConnectorPlan(read) error = %v", err)
	}
	if got, want := readResult["driver"], connectorDriverMCPFilesystem; got != want {
		t.Fatalf("driver=%v want %v", got, want)
	}
	if got, want := readResult["relativePath"], "notes/alpha.txt"; got != want {
		t.Fatalf("relativePath=%v want %v", got, want)
	}
	if got, ok := readResult["bytesRead"].(int); !ok || got <= 0 {
		t.Fatalf("bytesRead=%v want positive int", readResult["bytesRead"])
	}

	listPlan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "filesystem-proof",
			Driver:      connectorDriverMCPFilesystem,
			ToolName:    connectorToolListDirectory,
			Arguments: JSONObject{
				"path": "notes",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan(list) error = %v", err)
	}

	listResult, err := executeConnectorPlan(context.Background(), listPlan)
	if err != nil {
		t.Fatalf("executeConnectorPlan(list) error = %v", err)
	}
	if got, want := listResult["relativePath"], "notes"; got != want {
		t.Fatalf("relativePath=%v want %v", got, want)
	}
	if got, ok := listResult["entryCount"].(int); !ok || got != 2 {
		t.Fatalf("entryCount=%v want 2", listResult["entryCount"])
	}
}

func TestExecuteMCPFilesystemConnectorRejectsTraversal(t *testing.T) {
	rootPath := createFilesystemProofRoot(t)
	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(filesystemConnectorSettingsFixture(rootPath)))
	if err != nil {
		t.Fatalf("parse filesystem connector settings: %v", err)
	}

	plan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "filesystem-proof",
			Driver:      connectorDriverMCPFilesystem,
			ToolName:    connectorToolReadText,
			Arguments: JSONObject{
				"path": "../secret.txt",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan() error = %v", err)
	}
	if got := plan.Classification["statementClass"]; got != "path_traversal" {
		t.Fatalf("classification=%v want path_traversal", got)
	}
	if got := plan.Classification["readOnlyCandidate"]; got != false {
		t.Fatalf("readOnlyCandidate=%v want false", got)
	}
	if _, err := executeConnectorPlan(context.Background(), plan); err == nil || !strings.Contains(strings.ToLower(err.Error()), "outside configured root") {
		t.Fatalf("expected path containment denial, got err=%v", err)
	}
}

func TestExecuteRunConnectorFilesystemAllowedAndDenied(t *testing.T) {
	rootPath := createFilesystemProofRoot(t)
	store := newMemoryRunStore()
	if err := store.UpsertConnectorSettings(context.Background(), &ConnectorSettingsRecord{
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Settings:  mustMarshalJSON(filesystemConnectorSettingsFixture(rootPath)),
	}); err != nil {
		t.Fatalf("seed connector settings: %v", err)
	}

	providers := newFakeConnectorProviderClient()
	orch := &Orchestrator{
		Namespace:             "epydios-system",
		Store:                 store,
		ProviderRegistry:      providers,
		RetentionDefaultClass: "standard",
	}

	allowRun, err := orch.ExecuteRun(context.Background(), filesystemConnectorRunRequest("req-fs-allow", connectorToolReadText, "notes/alpha.txt"))
	if err != nil {
		t.Fatalf("allow ExecuteRun() error = %v", err)
	}
	if allowRun.PolicyDecision != "ALLOW" {
		t.Fatalf("allow run policy=%q want ALLOW", allowRun.PolicyDecision)
	}
	allowPayload := evidencePayloadEcho(t, allowRun.EvidenceRecordResponse)
	allowConnectorPayload, _ := allowPayload["connector"].(map[string]interface{})
	if allowConnectorPayload["state"] != "completed" {
		t.Fatalf("allow connector state=%v want completed", allowConnectorPayload["state"])
	}
	allowResult, _ := allowConnectorPayload["result"].(map[string]interface{})
	if allowResult["relativePath"] != "notes/alpha.txt" {
		t.Fatalf("allow connector relativePath=%v want notes/alpha.txt", allowResult["relativePath"])
	}

	denyRun, err := orch.ExecuteRun(context.Background(), filesystemConnectorRunRequest("req-fs-deny", connectorToolReadText, "../secret.txt"))
	if err != nil {
		t.Fatalf("deny ExecuteRun() error = %v", err)
	}
	if denyRun.PolicyDecision != "DENY" {
		t.Fatalf("deny run policy=%q want DENY", denyRun.PolicyDecision)
	}
	denyPayload := evidencePayloadEcho(t, denyRun.EvidenceRecordResponse)
	denyConnectorPayload, _ := denyPayload["connector"].(map[string]interface{})
	if denyConnectorPayload["state"] != "skipped" {
		t.Fatalf("deny connector state=%v want skipped", denyConnectorPayload["state"])
	}
	classification, _ := denyConnectorPayload["classification"].(map[string]interface{})
	if classification["statementClass"] != "path_traversal" {
		t.Fatalf("deny connector classification=%v want path_traversal", classification["statementClass"])
	}
}

func filesystemConnectorRunRequest(requestID, toolName, path string) RunCreateRequest {
	actionType := "connector.filesystem.read_text"
	actionVerb := "read"
	resourceKind := "filesystem-file"
	if toolName == connectorToolListDirectory {
		actionType = "connector.filesystem.list_directory"
		actionVerb = "list"
		resourceKind = "filesystem-directory"
	}
	return RunCreateRequest{
		Meta: ObjectMeta{
			RequestID: requestID,
			TenantID:  "tenant-a",
			ProjectID: "project-a",
		},
		Subject: JSONObject{
			"type": "connector_request",
		},
		Action: JSONObject{
			"type":  actionType,
			"class": "connector_read",
			"verb":  actionVerb,
		},
		Resource: JSONObject{
			"kind": resourceKind,
			"name": "filesystem-proof",
		},
		Context: JSONObject{
			"source": "filesystem-proof",
		},
		Connector: &ConnectorExecutionRequest{
			Enabled:      true,
			Tier:         connectorTierReadOnly,
			ConnectorID:  "filesystem-proof",
			Driver:       connectorDriverMCPFilesystem,
			ToolName:     toolName,
			ApprovalNote: "Filesystem proof connector request.",
			Arguments: JSONObject{
				"path": path,
			},
		},
	}
}

func createFilesystemProofRoot(t *testing.T) string {
	t.Helper()
	rootPath := t.TempDir()
	mustWriteProofFile(t, filepath.Join(rootPath, "notes", "alpha.txt"), "alpha filesystem proof\n")
	mustWriteProofFile(t, filepath.Join(rootPath, "notes", "beta.txt"), "beta filesystem proof\n")
	return rootPath
}

func mustWriteProofFile(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir proof path: %v", err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write proof file: %v", err)
	}
}
