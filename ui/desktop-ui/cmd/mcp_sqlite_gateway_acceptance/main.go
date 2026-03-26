package main

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
	"github.com/Epydios/Epydios-AgentOps-Control-Plane/ui/desktop-ui/internal/nativeapp"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	proofConnectorDriverSQLite     = "mcp_sqlite"
	proofConnectorDriverPostgres   = "mcp_postgres"
	proofConnectorDriverFilesystem = "mcp_filesystem"
	proofConnectorDriverGitHub     = "mcp_github"
	proofConnectorDriverBrowser    = "mcp_browser"
)

type connectorGatewayProofCall struct {
	ToolName             string
	Arguments            map[string]interface{}
	ExpectedError        bool
	ExpectedClass        string
	AssertStructuredFunc func(map[string]interface{}, func(string))
}

type connectorGatewayApprovalProofCall struct {
	ToolName              string
	Arguments             map[string]interface{}
	ExpectedDeferredClass string
	AssertStructuredFunc  func(map[string]interface{}, func(string))
}

type connectorGatewayProofFixture struct {
	Driver              string
	ConnectorID         string
	ConnectorLabel      string
	PhaseDirName        string
	VerifyBasename      string
	SummaryStatus       string
	TokenValue          string
	ShimClientName      string
	ShimServerName      string
	Settings            map[string]interface{}
	RuntimeRefValues    map[string]interface{}
	ExpectedToolNames   []string
	AllowedCalls        []connectorGatewayProofCall
	ApprovalCall        *connectorGatewayApprovalProofCall
	DeniedCall          connectorGatewayProofCall
	SummaryMetadata     map[string]any
	AssertDataUnchanged func(func(string))
	Cleanup             func(func(string))
}

func main() {
	repoRoot := mustRepoRoot()
	stamp := stampUTC()
	proofDriver := resolveConnectorProofDriver()
	proofFamily := connectorProofFamily(proofDriver)
	phaseDirName := fmt.Sprintf("mcp-%s-gateway-proof", proofFamily)
	verifyBasename := fmt.Sprintf("verify-mcp-%s-gateway", proofFamily)

	phaseRoot := filepath.Join(repoRoot, ".epydios", "internal-readiness", phaseDirName)
	runRoot := filepath.Join(phaseRoot, stamp)
	must(os.MkdirAll(runRoot, 0o755))
	must(os.MkdirAll(phaseRoot, 0o755))

	logPath := filepath.Join(runRoot, verifyBasename+".log")
	summaryPath := filepath.Join(runRoot, verifyBasename+".summary.json")
	checklistPath := filepath.Join(runRoot, "operator-"+verifyBasename+"-checklist.json")
	latestLogPath := filepath.Join(phaseRoot, verifyBasename+"-latest.log")
	latestSummaryPath := filepath.Join(phaseRoot, verifyBasename+"-latest.summary.json")

	logger := newProofLogger(logPath)
	fixture := setupConnectorGatewayProofFixture(runRoot, proofDriver, logger.log)
	defer fixture.Cleanup(logger.log)
	restoreRefEnv := applyConnectorProofRefValues(fixture.RuntimeRefValues)
	defer restoreRefEnv()
	tokenPath := filepath.Join(runRoot, "gateway-token")
	requestsRoot := filepath.Join(runRoot, "gateway-requests")
	must(os.MkdirAll(requestsRoot, 0o755))

	must(os.WriteFile(tokenPath, []byte(fixture.TokenValue+"\n"), 0o600))

	store := newProofRunStore()
	providers := newProofConnectorProviderClient(fixture.Driver)
	orchestrator := &runtimeapi.Orchestrator{
		Namespace:             "epydios-system",
		Store:                 store,
		ProviderRegistry:      providers,
		RetentionDefaultClass: "standard",
	}
	runtimeHandler := runtimeapi.NewAPIServer(store, orchestrator, nil).Routes()
	runtimeServer := newLoopbackServer(runtimeHandler)
	defer runtimeServer.Close()
	runtimePort := mustPort(runtimeServer.URL)
	logger.log("started loopback runtime API on " + runtimeServer.URL)

	runtimePutJSON(runtimeServer.URL+"/v1alpha1/runtime/connectors/settings", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": fixture.Settings,
	}, logger.log)
	logger.log("persisted bounded connector settings through the runtime HTTP API")

	opts := nativeapp.DefaultLaunchOptions()
	opts.Mode = "live"
	opts.RuntimeLocalPort = runtimePort
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true

	gatewayHandler := nativeapp.NewGatewayHandler(nativeapp.GatewayServiceRecord{
		State:        "running",
		Health:       "healthy",
		BaseURL:      "http://127.0.0.1:0",
		TokenPath:    tokenPath,
		RequestsRoot: requestsRoot,
	}, fixture.TokenValue, opts)
	gatewayServer := newLoopbackServer(gatewayHandler)
	defer gatewayServer.Close()
	logger.log("started loopback localhost gateway on " + gatewayServer.URL)

	shim := startMCPShim(repoRoot, gatewayServer.URL, tokenPath, fixture.ConnectorID, fixture.ShimClientName, fixture.ShimServerName, logger.log)
	defer shim.close(logger.log)

	initResp := shim.request(map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]interface{}{
			"protocolVersion": "2025-03-26",
			"clientInfo": map[string]interface{}{
				"name":    "phase2-verifier",
				"version": "0.1.0",
			},
		},
	}, logger.log)
	protocolVersion := strings.TrimSpace(interfaceString(nestedMapValue(initResp, "result", "protocolVersion")))
	assert(protocolVersion == "2025-03-26", "expected initialize protocolVersion 2025-03-26, got %q", protocolVersion)
	logger.log("proved MCP initialize over stdio")

	shim.notify(map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "notifications/initialized",
		"params":  map[string]interface{}{},
	}, logger.log)

	toolsResp := shim.request(map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "tools/list",
		"params":  map[string]interface{}{},
	}, logger.log)
	tools, _ := nestedMapValue(toolsResp, "result", "tools").([]interface{})
	toolNames := make([]string, 0, len(tools))
	for _, item := range tools {
		entry, _ := item.(map[string]interface{})
		toolNames = append(toolNames, strings.TrimSpace(interfaceString(entry["name"])))
	}
	sort.Strings(toolNames)
	expectedToolNames := append([]string(nil), fixture.ExpectedToolNames...)
	sort.Strings(expectedToolNames)
	assert(len(toolNames) == len(expectedToolNames), "expected %d bounded MCP tool(s), got %d", len(expectedToolNames), len(toolNames))
	for idx := range expectedToolNames {
		assert(toolNames[idx] == expectedToolNames[idx], "expected tools/list[%d]=%q, got %q", idx, expectedToolNames[idx], toolNames[idx])
	}
	logger.log("proved MCP tools/list through the localhost gateway MCP adapter")

	nextRequestID := 3
	for _, call := range fixture.AllowedCalls {
		allowResp := shim.request(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      nextRequestID,
			"method":  "tools/call",
			"params": map[string]interface{}{
				"name":      call.ToolName,
				"arguments": call.Arguments,
			},
		}, logger.log)
		nextRequestID++
		allowResult, _ := allowResp["result"].(map[string]interface{})
		assert(!truthy(allowResult["isError"]), "expected allowed %s tools/call isError=false, got %+v", call.ToolName, allowResult)
		allowStructured, _ := allowResult["structuredContent"].(map[string]interface{})
		allowRunID := strings.TrimSpace(interfaceString(allowStructured["runId"]))
		assert(allowRunID != "", "expected allowed %s tools/call to surface runId", call.ToolName)
		if call.AssertStructuredFunc != nil {
			call.AssertStructuredFunc(allowStructured, logger.log)
		}
		logger.log("proved allowed MCP tools/call completed through shim, gateway, and runtime connector execution for " + call.ToolName)
	}
	if fixture.ApprovalCall != nil {
		approvalRequestID := nextRequestID
		deferResp := shim.request(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      approvalRequestID,
			"method":  "tools/call",
			"params": map[string]interface{}{
				"name":      fixture.ApprovalCall.ToolName,
				"arguments": fixture.ApprovalCall.Arguments,
			},
		}, logger.log)
		nextRequestID++
		deferResult, _ := deferResp["result"].(map[string]interface{})
		assert(truthy(deferResult["isError"]), "expected approval-gated %s tools/call isError=true before approval, got %+v", fixture.ApprovalCall.ToolName, deferResult)
		deferStructured, _ := deferResult["structuredContent"].(map[string]interface{})
		assert(strings.EqualFold(strings.TrimSpace(interfaceString(deferStructured["policyDecision"])), "DEFER"), "expected approval-gated policyDecision DEFER, got %v", deferStructured["policyDecision"])
		assert(truthy(deferStructured["approvalId"] != nil), "expected approval-gated tools/call to surface approvalId")
		deferClassification, _ := deferStructured["classification"].(map[string]interface{})
		assert(strings.EqualFold(strings.TrimSpace(interfaceString(deferClassification["statementClass"])), fixture.ApprovalCall.ExpectedDeferredClass), "expected approval-gated classification statementClass %s, got %v", fixture.ApprovalCall.ExpectedDeferredClass, deferClassification["statementClass"])
		interpositionRequestID := strings.TrimSpace(interfaceString(deferStructured["interpositionRequestId"]))
		assert(interpositionRequestID != "", "expected approval-gated tools/call to surface interpositionRequestId")
		holdRoot := filepath.Join(runRoot, "holds")
		resolvedHold, err := nativeapp.ResolveGatewayHoldRecord(holdRoot, requestsRoot, interpositionRequestID, "APPROVE", "Bounded browser destructive click proof approval.")
		must(err)
		assert(resolvedHold.State == "approval_granted", "expected resolved hold state approval_granted, got %s", resolvedHold.State)
		retryResp := shim.request(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      approvalRequestID,
			"method":  "tools/call",
			"params": map[string]interface{}{
				"name":      fixture.ApprovalCall.ToolName,
				"arguments": fixture.ApprovalCall.Arguments,
			},
		}, logger.log)
		retryResult, _ := retryResp["result"].(map[string]interface{})
		assert(!truthy(retryResult["isError"]), "expected approval-gated %s retry isError=false after approval, got %+v", fixture.ApprovalCall.ToolName, retryResult)
		retryStructured, _ := retryResult["structuredContent"].(map[string]interface{})
		assert(strings.EqualFold(strings.TrimSpace(interfaceString(retryStructured["policyDecision"])), "ALLOW"), "expected approval-gated retry policyDecision ALLOW, got %v", retryStructured["policyDecision"])
		if fixture.ApprovalCall.AssertStructuredFunc != nil {
			fixture.ApprovalCall.AssertStructuredFunc(retryStructured, logger.log)
		}
		logger.log("proved one approval-gated MCP tools/call deferred, was operator-approved, and then completed on retry")
	}

	denyResp := shim.request(map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      nextRequestID,
		"method":  "tools/call",
		"params": map[string]interface{}{
			"name":      fixture.DeniedCall.ToolName,
			"arguments": fixture.DeniedCall.Arguments,
		},
	}, logger.log)
	denyResult, _ := denyResp["result"].(map[string]interface{})
	assert(truthy(denyResult["isError"]), "expected denied tools/call isError=true, got %+v", denyResult)
	denyStructured, _ := denyResult["structuredContent"].(map[string]interface{})
	classification, _ := denyStructured["classification"].(map[string]interface{})
	assert(strings.EqualFold(strings.TrimSpace(interfaceString(classification["statementClass"])), fixture.DeniedCall.ExpectedClass), "expected denied classification statementClass %s, got %v", fixture.DeniedCall.ExpectedClass, classification["statementClass"])
	denyRunID := strings.TrimSpace(interfaceString(denyStructured["runId"]))
	assert(denyRunID != "", "expected denied tools/call to surface runId")
	logger.log("proved one denied MCP tools/call was blocked before connector execution")

	persisted := readGatewayRequestRecords(requestsRoot)
	expectedPersisted := len(fixture.AllowedCalls) + 1
	if fixture.ApprovalCall != nil {
		expectedPersisted += 2
	}
	assert(len(persisted) == expectedPersisted, "expected %d persisted gateway request records, got %d", expectedPersisted, len(persisted))
	for _, item := range persisted {
		assert(item.Interposition.ClientSurface == "mcp", "expected gateway record clientSurface=mcp, got %q", item.Interposition.ClientSurface)
		assert(item.Interposition.Upstream.Path == "/v1/mcp/proxy/tools/call", "expected gateway record upstream.path=/v1/mcp/proxy/tools/call, got %q", item.Interposition.Upstream.Path)
		assert(item.Interposition.Upstream.Protocol == "mcp_stdio", "expected gateway record upstream.protocol=mcp_stdio, got %q", item.Interposition.Upstream.Protocol)
	}
	logger.log("verified gateway persisted MCP interposition records for both tool calls")

	fixture.AssertDataUnchanged(logger.log)

	checklist := map[string]any{
		"generated_at_utc": stamp,
		"bounded_" + fixture.Driver + "_mcp_gateway_proof": map[string]any{
			"status": "pass",
			"steps": []string{
				"MCP initialize completed over the local stdio shim",
				fmt.Sprintf("tools/list returned the bounded %s MCP tool set through the localhost gateway adapter", proofFamily),
				"allowed tools/call requests completed through gateway interposition and the runtime connector path",
				fmt.Sprintf("one denied tools/call was blocked before %s execution", proofFamily),
				"gateway request records and runtime evidence continuity were persisted for the MCP tool calls",
			},
			"runtime_api_surface": "loopback_http",
			"gateway_surface":     "localhost_gateway_mcp_proxy_contract",
			"shim_transport":      "stdio_jsonrpc",
			"log_path":            logPath,
			"summary_path":        summaryPath,
		},
	}
	for key, value := range fixture.SummaryMetadata {
		checklist["bounded_"+fixture.Driver+"_mcp_gateway_proof"].(map[string]any)[key] = value
	}
	if fixture.ApprovalCall != nil {
		checklist["bounded_"+fixture.Driver+"_mcp_gateway_proof"].(map[string]any)["steps"] = append(
			checklist["bounded_"+fixture.Driver+"_mcp_gateway_proof"].(map[string]any)["steps"].([]string),
			"one destructive browser MCP tools/call deferred for operator approval and completed only after approval on retry",
		)
	}
	reason := fmt.Sprintf("Bounded %s MCP proof accepted MCP initialize and tools/list over stdio, completed the allowed tools/call set through the localhost gateway and runtime connector path, and denied one blocked tools/call before execution.", proofFamily)
	if fixture.ApprovalCall != nil {
		reason = fmt.Sprintf("Bounded %s MCP proof accepted MCP initialize and tools/list over stdio, completed the allowed tools/call set through the localhost gateway and runtime connector path, deferred one approval-gated destructive tools/call until operator approval, completed it on retry after approval, and denied one blocked tools/call before execution.", proofFamily)
	}
	summary := map[string]any{
		"generated_at_utc":    stamp,
		"status":              fixture.SummaryStatus,
		"reason":              reason,
		"runtime_api_surface": "loopback_http",
		"gateway_surface":     "localhost_gateway_mcp_proxy_contract",
		"shim_transport":      "stdio_jsonrpc",
		"log_path":            logPath,
		"checklist_path":      checklistPath,
	}
	for key, value := range fixture.SummaryMetadata {
		summary[key] = value
	}

	writeJSON(checklistPath, checklist)
	writeJSON(summaryPath, summary)
	copyFile(logPath, latestLogPath)
	copyFile(summaryPath, latestSummaryPath)
	fmt.Printf("%s gateway verifier passed.\n", proofFamily)
}

type shimProcess struct {
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	scanner *bufio.Scanner
}

func startMCPShim(repoRoot, gatewayBaseURL, tokenPath, connectorID, clientName, serverName string, logf func(string)) *shimProcess {
	cmd := exec.Command("go", "run", "./cmd/mcp-sqlite-stdio")
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(),
		"EPYDIOS_MCP_GATEWAY_BASE_URL="+gatewayBaseURL,
		"EPYDIOS_MCP_GATEWAY_TOKEN_PATH="+tokenPath,
		"EPYDIOS_MCP_TENANT_ID=tenant-a",
		"EPYDIOS_MCP_PROJECT_ID=project-a",
		"EPYDIOS_MCP_ENVIRONMENT_ID=local",
		"EPYDIOS_MCP_CONNECTOR_ID="+connectorID,
		"EPYDIOS_MCP_CLIENT_ID=client-mcp-phase2",
		"EPYDIOS_MCP_CLIENT_NAME="+clientName,
		"EPYDIOS_MCP_CLIENT_VERSION=0.1.0",
		"EPYDIOS_MCP_SERVER_NAME="+serverName,
	)
	stdin, err := cmd.StdinPipe()
	must(err)
	stdout, err := cmd.StdoutPipe()
	must(err)
	stderr, err := cmd.StderrPipe()
	must(err)
	must(cmd.Start())
	go streamShimStderr(stderr, logf)
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)
	return &shimProcess{cmd: cmd, stdin: stdin, scanner: scanner}
}

func streamShimStderr(stderr io.ReadCloser, logf func(string)) {
	scanner := bufio.NewScanner(stderr)
	scanner.Buffer(make([]byte, 0, 4096), 1<<20)
	for scanner.Scan() {
		logf("[shim stderr] " + scanner.Text())
	}
}

func (s *shimProcess) request(payload map[string]interface{}, logf func(string)) map[string]interface{} {
	encoded := mustJSONBytes(payload)
	logf("$ shim <= " + strings.TrimSpace(string(encoded)))
	_, err := s.stdin.Write(append(encoded, '\n'))
	must(err)
	if !s.scanner.Scan() {
		must(s.scanner.Err())
		panic("shim did not return a response")
	}
	line := strings.TrimSpace(s.scanner.Text())
	logf("$ shim => " + line)
	var resp map[string]interface{}
	must(json.Unmarshal([]byte(line), &resp))
	if resp["error"] != nil {
		panic(fmt.Sprintf("shim returned json-rpc error: %+v", resp["error"]))
	}
	return resp
}

func (s *shimProcess) notify(payload map[string]interface{}, logf func(string)) {
	encoded := mustJSONBytes(payload)
	logf("$ shim <= " + strings.TrimSpace(string(encoded)))
	_, err := s.stdin.Write(append(encoded, '\n'))
	must(err)
}

func (s *shimProcess) close(logf func(string)) {
	if s == nil || s.cmd == nil {
		return
	}
	if s.stdin != nil {
		_ = s.stdin.Close()
	}
	done := make(chan error, 1)
	go func() {
		done <- s.cmd.Wait()
	}()
	select {
	case err := <-done:
		if err != nil {
			logf("shim exited with error: " + err.Error())
		}
	case <-time.After(3 * time.Second):
		_ = s.cmd.Process.Kill()
		<-done
	}
}

type persistedGatewayRequest struct {
	Interposition struct {
		ClientSurface string `json:"clientSurface"`
		Upstream      struct {
			Protocol string `json:"protocol"`
			Path     string `json:"path"`
		} `json:"upstream"`
	} `json:"interposition"`
}

func readGatewayRequestRecords(requestsRoot string) []persistedGatewayRequest {
	entries, err := os.ReadDir(requestsRoot)
	must(err)
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		names = append(names, entry.Name())
	}
	sort.Strings(names)
	items := make([]persistedGatewayRequest, 0, len(names))
	for _, name := range names {
		content, err := os.ReadFile(filepath.Join(requestsRoot, name))
		must(err)
		var item persistedGatewayRequest
		must(json.Unmarshal(content, &item))
		items = append(items, item)
	}
	return items
}

type loopbackServer struct {
	URL      string
	server   *http.Server
	listener net.Listener
}

func newLoopbackServer(handler http.Handler) *loopbackServer {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	must(err)
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		_ = server.Serve(listener)
	}()
	return &loopbackServer{
		URL:      "http://" + listener.Addr().String(),
		server:   server,
		listener: listener,
	}
}

func (s *loopbackServer) Close() {
	if s == nil || s.server == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = s.server.Shutdown(ctx)
}

func runtimePutJSON(requestURL string, body interface{}, logf func(string)) {
	encoded := mustJSONBytes(body)
	logf("$ PUT " + requestURL)
	req, err := http.NewRequest(http.MethodPut, requestURL, bytes.NewReader(encoded))
	must(err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	must(err)
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(resp.Body)
	must(err)
	if resp.StatusCode != http.StatusOK {
		panic(fmt.Sprintf("runtime PUT failed status=%d body=%s", resp.StatusCode, string(responseBody)))
	}
}

func mustPort(baseURL string) int {
	parsed, err := url.Parse(baseURL)
	must(err)
	_, portText, err := net.SplitHostPort(parsed.Host)
	must(err)
	var port int
	_, err = fmt.Sscanf(portText, "%d", &port)
	must(err)
	return port
}

func nestedMapValue(root map[string]interface{}, keys ...string) interface{} {
	var current interface{} = root
	for _, key := range keys {
		next, _ := current.(map[string]interface{})
		if next == nil {
			return nil
		}
		current = next[key]
	}
	return current
}

func truthy(value interface{}) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	default:
		return false
	}
}

func numericValue(value interface{}) (int, bool) {
	switch typed := value.(type) {
	case float64:
		return int(typed), true
	case float32:
		return int(typed), true
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed), true
		}
	}
	return 0, false
}

type proofRunStore struct {
	mu                  sync.RWMutex
	runs                map[string]*runtimeapi.RunRecord
	integrationSettings map[string]*runtimeapi.IntegrationSettingsRecord
	connectorSettings   map[string]*runtimeapi.ConnectorSettingsRecord
}

func newProofRunStore() *proofRunStore {
	return &proofRunStore{
		runs:                map[string]*runtimeapi.RunRecord{},
		integrationSettings: map[string]*runtimeapi.IntegrationSettingsRecord{},
		connectorSettings:   map[string]*runtimeapi.ConnectorSettingsRecord{},
	}
}

func (s *proofRunStore) Ping(context.Context) error         { return nil }
func (s *proofRunStore) EnsureSchema(context.Context) error { return nil }
func (s *proofRunStore) UpsertTask(context.Context, *runtimeapi.TaskRecord) error {
	return fmt.Errorf("tasks not implemented in proof store")
}
func (s *proofRunStore) GetTask(context.Context, string) (*runtimeapi.TaskRecord, error) {
	return nil, sql.ErrNoRows
}
func (s *proofRunStore) ListTasks(context.Context, runtimeapi.TaskListQuery) ([]runtimeapi.TaskRecord, error) {
	return nil, nil
}
func (s *proofRunStore) UpsertSession(context.Context, *runtimeapi.SessionRecord) error {
	return fmt.Errorf("sessions not implemented in proof store")
}
func (s *proofRunStore) GetSession(context.Context, string) (*runtimeapi.SessionRecord, error) {
	return nil, sql.ErrNoRows
}
func (s *proofRunStore) ListSessions(context.Context, runtimeapi.SessionListQuery) ([]runtimeapi.SessionRecord, error) {
	return nil, nil
}
func (s *proofRunStore) UpsertSessionWorker(context.Context, *runtimeapi.SessionWorkerRecord) error {
	return fmt.Errorf("session workers not implemented in proof store")
}
func (s *proofRunStore) ListSessionWorkers(context.Context, runtimeapi.SessionWorkerListQuery) ([]runtimeapi.SessionWorkerRecord, error) {
	return nil, nil
}
func (s *proofRunStore) UpsertToolAction(context.Context, *runtimeapi.ToolActionRecord) error {
	return fmt.Errorf("tool actions not implemented in proof store")
}
func (s *proofRunStore) ListToolActions(context.Context, runtimeapi.ToolActionListQuery) ([]runtimeapi.ToolActionRecord, error) {
	return nil, nil
}
func (s *proofRunStore) AppendSessionEvent(context.Context, *runtimeapi.SessionEventRecord) error {
	return fmt.Errorf("session events not implemented in proof store")
}
func (s *proofRunStore) ListSessionEvents(context.Context, runtimeapi.SessionEventListQuery) ([]runtimeapi.SessionEventRecord, error) {
	return nil, nil
}
func (s *proofRunStore) UpsertApprovalCheckpoint(context.Context, *runtimeapi.ApprovalCheckpointRecord) error {
	return fmt.Errorf("approval checkpoints not implemented in proof store")
}
func (s *proofRunStore) ListApprovalCheckpoints(context.Context, runtimeapi.ApprovalCheckpointListQuery) ([]runtimeapi.ApprovalCheckpointRecord, error) {
	return nil, nil
}
func (s *proofRunStore) UpsertEvidenceRecord(context.Context, *runtimeapi.EvidenceRecord) error {
	return fmt.Errorf("evidence records not implemented in proof store")
}
func (s *proofRunStore) ListEvidenceRecords(context.Context, runtimeapi.EvidenceRecordListQuery) ([]runtimeapi.EvidenceRecord, error) {
	return nil, nil
}

func (s *proofRunStore) UpsertRun(_ context.Context, record *runtimeapi.RunRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[record.RunID] = cloneRunRecord(record)
	return nil
}

func (s *proofRunStore) GetRun(_ context.Context, runID string) (*runtimeapi.RunRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.runs[strings.TrimSpace(runID)]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneRunRecord(record), nil
}

func (s *proofRunStore) ListRuns(_ context.Context, _ runtimeapi.RunListQuery) ([]runtimeapi.RunSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]runtimeapi.RunSummary, 0, len(s.runs))
	for _, record := range s.runs {
		items = append(items, runtimeapi.RunSummary{
			RunID:                    record.RunID,
			RequestID:                record.RequestID,
			TenantID:                 record.TenantID,
			ProjectID:                record.ProjectID,
			Environment:              record.Environment,
			RetentionClass:           record.RetentionClass,
			ExpiresAt:                record.ExpiresAt,
			Status:                   record.Status,
			SelectedProfileProvider:  record.SelectedProfileProvider,
			SelectedPolicyProvider:   record.SelectedPolicyProvider,
			SelectedEvidenceProvider: record.SelectedEvidenceProvider,
			SelectedDesktopProvider:  record.SelectedDesktopProvider,
			PolicyDecision:           record.PolicyDecision,
			PolicyBundleID:           record.PolicyBundleID,
			PolicyBundleVersion:      record.PolicyBundleVersion,
			PolicyGrantTokenPresent:  record.PolicyGrantTokenPresent,
			PolicyGrantTokenSHA256:   record.PolicyGrantTokenSHA256,
			CreatedAt:                record.CreatedAt,
			UpdatedAt:                record.UpdatedAt,
		})
	}
	return items, nil
}

func (s *proofRunStore) PruneRuns(_ context.Context, query runtimeapi.RunPruneQuery) (*runtimeapi.RunPruneResult, error) {
	return &runtimeapi.RunPruneResult{
		DryRun:         query.DryRun,
		Before:         query.Before,
		RetentionClass: query.RetentionClass,
		Limit:          query.Limit,
	}, nil
}

func (s *proofRunStore) UpsertIntegrationSettings(_ context.Context, record *runtimeapi.IntegrationSettingsRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.integrationSettings[integrationSettingsKey(record.TenantID, record.ProjectID)] = cloneIntegrationSettingsRecord(record)
	return nil
}

func (s *proofRunStore) GetIntegrationSettings(_ context.Context, tenantID, projectID string) (*runtimeapi.IntegrationSettingsRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.integrationSettings[integrationSettingsKey(tenantID, projectID)]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneIntegrationSettingsRecord(record), nil
}

func (s *proofRunStore) UpsertConnectorSettings(_ context.Context, record *runtimeapi.ConnectorSettingsRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.connectorSettings[integrationSettingsKey(record.TenantID, record.ProjectID)] = cloneConnectorSettingsRecord(record)
	return nil
}

func (s *proofRunStore) GetConnectorSettings(_ context.Context, tenantID, projectID string) (*runtimeapi.ConnectorSettingsRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.connectorSettings[integrationSettingsKey(tenantID, projectID)]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneConnectorSettingsRecord(record), nil
}

type proofConnectorProviderClient struct {
	driver string
}

func newProofConnectorProviderClient(driver string) *proofConnectorProviderClient {
	return &proofConnectorProviderClient{driver: strings.ToLower(strings.TrimSpace(driver))}
}

func (c *proofConnectorProviderClient) SelectProvider(_ context.Context, _ string, providerType, requiredCapability, _ string, minPriority int64) (*runtimeapi.ProviderTarget, error) {
	targets := map[string]*runtimeapi.ProviderTarget{
		"ProfileResolver": {
			Name:         "proof-profile-static",
			Namespace:    "epydios-system",
			ProviderType: "ProfileResolver",
			ProviderID:   "proof-profile-static",
			Priority:     100,
			AuthMode:     "None",
		},
		"PolicyProvider": {
			Name:         "proof-policy-connector",
			Namespace:    "epydios-system",
			ProviderType: "PolicyProvider",
			ProviderID:   "proof-policy-connector",
			Priority:     100,
			AuthMode:     "None",
		},
		"EvidenceProvider": {
			Name:         "proof-evidence-memory",
			Namespace:    "epydios-system",
			ProviderType: "EvidenceProvider",
			ProviderID:   "proof-evidence-memory",
			Priority:     100,
			AuthMode:     "None",
		},
	}
	target, ok := targets[providerType]
	if !ok || target.Priority < minPriority {
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}
	copyTarget := *target
	return &copyTarget, nil
}

func (c *proofConnectorProviderClient) PostJSON(_ context.Context, target *runtimeapi.ProviderTarget, path string, reqBody interface{}, out interface{}) error {
	proofFamily := connectorProofFamily(c.driver)
	bundleID := "EPYDIOS_CONNECTOR_" + strings.ToUpper(strings.ReplaceAll(proofFamily, "-", "_")) + "_BOUNDARY"
	profileID := "connector-" + proofFamily + "-proof"
	switch target.ProviderType {
	case "ProfileResolver":
		return assignJSON(out, map[string]interface{}{
			"profileId":      profileID,
			"profileVersion": "v1",
			"source":         "runtime-proof",
		})
	case "PolicyProvider":
		var req map[string]interface{}
		if err := decodeJSON(reqBody, &req); err != nil {
			return err
		}
		contextMap, _ := req["context"].(map[string]interface{})
		connectorMap, _ := contextMap["connector"].(map[string]interface{})
		readOnlyCandidate, _ := connectorMap["readOnlyCandidate"].(bool)
		humanApprovalGranted, _ := connectorMap["humanApprovalGranted"].(bool)
		statementClass, _ := connectorMap["statementClass"].(string)
		decision := "ALLOW"
		switch {
		case strings.EqualFold(statementClass, "destructive_button_click"):
			if humanApprovalGranted {
				decision = "ALLOW"
			} else {
				decision = "DEFER"
			}
		case !readOnlyCandidate || strings.EqualFold(statementClass, "mutation"):
			decision = "DENY"
		}
		resp := map[string]interface{}{
			"decision": decision,
			"policyBundle": map[string]interface{}{
				"policyId":      bundleID,
				"policyVersion": "v1",
			},
		}
		if decision == "ALLOW" {
			resp["grantToken"] = "grant-" + proofFamily + "-proof"
		}
		return assignJSON(out, resp)
	case "EvidenceProvider":
		switch path {
		case "/v1alpha1/evidence-provider/record":
			var req map[string]interface{}
			if err := decodeJSON(reqBody, &req); err != nil {
				return err
			}
			return assignJSON(out, map[string]interface{}{
				"accepted":    true,
				"evidenceId":  "evidence-" + proofFamily + "-proof-1",
				"storageUri":  "memory://" + proofFamily + "-proof/evidence-1",
				"payloadEcho": req["payload"],
			})
		case "/v1alpha1/evidence-provider/finalize-bundle":
			return assignJSON(out, map[string]interface{}{
				"bundleId":         "bundle-" + proofFamily + "-proof-1",
				"manifestUri":      "memory://" + proofFamily + "-proof/bundle-1",
				"manifestChecksum": "sha256:" + proofFamily + "-proof",
				"itemCount":        1,
			})
		default:
			return fmt.Errorf("unexpected evidence path %q", path)
		}
	default:
		return fmt.Errorf("unexpected provider type %q", target.ProviderType)
	}
}

func mustRepoRoot() string {
	_, filePath, _, ok := runtime.Caller(0)
	if !ok {
		panic("unable to resolve connector MCP gateway proof harness path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filePath), "../../../.."))
}

func stampUTC() string {
	return time.Now().UTC().Format("20060102T150405Z")
}

type proofLogger struct {
	logPath string
}

func newProofLogger(logPath string) *proofLogger {
	return &proofLogger{logPath: logPath}
}

func (p *proofLogger) log(line string) {
	entry := fmt.Sprintf("[%s] %s", time.Now().UTC().Format(time.RFC3339), line)
	file, err := os.OpenFile(p.logPath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0o644)
	if err == nil {
		_, _ = file.WriteString(entry + "\n")
		_ = file.Close()
	}
}

func noopLog(string) {}

func applyConnectorProofRefValues(values map[string]interface{}) func() {
	previousPath, hadPath := os.LookupEnv("RUNTIME_REF_VALUES_PATH")
	previousJSON, hadJSON := os.LookupEnv("RUNTIME_REF_VALUES_JSON")
	_ = os.Unsetenv("RUNTIME_REF_VALUES_PATH")
	if len(values) == 0 {
		_ = os.Unsetenv("RUNTIME_REF_VALUES_JSON")
	} else {
		_ = os.Setenv("RUNTIME_REF_VALUES_JSON", string(mustJSONBytes(values)))
	}
	return func() {
		if hadPath {
			_ = os.Setenv("RUNTIME_REF_VALUES_PATH", previousPath)
		} else {
			_ = os.Unsetenv("RUNTIME_REF_VALUES_PATH")
		}
		if hadJSON {
			_ = os.Setenv("RUNTIME_REF_VALUES_JSON", previousJSON)
		} else {
			_ = os.Unsetenv("RUNTIME_REF_VALUES_JSON")
		}
	}
}

func resolveConnectorProofDriver() string {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("EPYDIOS_CONNECTOR_PROOF_DRIVER"))) {
	case "", proofConnectorDriverSQLite:
		return proofConnectorDriverSQLite
	case proofConnectorDriverPostgres:
		return proofConnectorDriverPostgres
	case proofConnectorDriverFilesystem:
		return proofConnectorDriverFilesystem
	case proofConnectorDriverGitHub:
		return proofConnectorDriverGitHub
	case proofConnectorDriverBrowser:
		return proofConnectorDriverBrowser
	default:
		panic("EPYDIOS_CONNECTOR_PROOF_DRIVER must be mcp_sqlite, mcp_postgres, mcp_filesystem, mcp_github, or mcp_browser")
	}
}

func connectorProofFamily(driver string) string {
	switch strings.ToLower(strings.TrimSpace(driver)) {
	case proofConnectorDriverPostgres:
		return "postgres"
	case proofConnectorDriverFilesystem:
		return "filesystem"
	case proofConnectorDriverGitHub:
		return "github"
	case proofConnectorDriverBrowser:
		return "browser"
	default:
		return "sqlite"
	}
}

func setupConnectorGatewayProofFixture(runRoot, driver string, logf func(string)) connectorGatewayProofFixture {
	switch strings.ToLower(strings.TrimSpace(driver)) {
	case proofConnectorDriverPostgres:
		return setupPostgresConnectorGatewayProofFixture(runRoot, logf)
	case proofConnectorDriverFilesystem:
		return setupFilesystemConnectorGatewayProofFixture(runRoot, logf)
	case proofConnectorDriverGitHub:
		return setupGitHubConnectorGatewayProofFixture(runRoot, logf)
	case proofConnectorDriverBrowser:
		return setupBrowserConnectorGatewayProofFixture(runRoot, logf)
	case proofConnectorDriverSQLite:
		fallthrough
	default:
		return setupSQLiteConnectorGatewayProofFixture(runRoot, logf)
	}
}

func setupSQLiteConnectorGatewayProofFixture(runRoot string, logf func(string)) connectorGatewayProofFixture {
	dbPath := filepath.Join(runRoot, "sqlite-proof.db")
	createSQLiteProofDatabase(dbPath, logf)
	return connectorGatewayProofFixture{
		Driver:         proofConnectorDriverSQLite,
		ConnectorID:    "sqlite-proof",
		ConnectorLabel: "SQLite proof",
		PhaseDirName:   "mcp-sqlite-gateway-proof",
		VerifyBasename: "verify-mcp-sqlite-gateway",
		SummaryStatus:  "bounded_host_facing_sqlite_mcp_beta_proof",
		TokenValue:     "phase2-sqlite-proof-token",
		ShimClientName: "Epydios MCP SQLite Shim",
		ShimServerName: "epydios-mcp-sqlite",
		Settings: map[string]interface{}{
			"selectedConnectorId": "sqlite-proof",
			"profiles": []map[string]interface{}{{
				"id":           "sqlite-proof",
				"label":        "SQLite proof",
				"driver":       proofConnectorDriverSQLite,
				"databasePath": dbPath,
				"allowedTools": []string{"query_read_only"},
				"enabled":      true,
			}},
		},
		ExpectedToolNames: []string{"query_read_only"},
		AllowedCalls: []connectorGatewayProofCall{{
			ToolName: "query_read_only",
			Arguments: map[string]interface{}{
				"query": "SELECT id, label FROM proof_items WHERE label = 'alpha' ORDER BY id LIMIT 1;",
			},
			AssertStructuredFunc: func(structured map[string]interface{}, logf func(string)) {
				allowNestedResult, _ := structured["result"].(map[string]interface{})
				allowRowCount, _ := numericValue(allowNestedResult["rowCount"])
				assert(allowRowCount == 1, "expected allowed tools/call rowCount 1, got %d", allowRowCount)
			},
		}},
		DeniedCall: connectorGatewayProofCall{
			ToolName:      "query_read_only",
			ExpectedClass: "mutation",
			Arguments: map[string]interface{}{
				"query": "DELETE FROM proof_items WHERE label = 'alpha';",
			},
		},
		SummaryMetadata: map[string]any{
			"connector_driver": proofConnectorDriverSQLite,
			"connector_family": "sqlite",
		},
		AssertDataUnchanged: func(logf func(string)) {
			rows := querySQLiteRows(dbPath, "SELECT id, label FROM proof_items ORDER BY id;", logf)
			assert(len(rows) == 2, "expected sqlite proof_items row count 2 after denied mutation, got %d", len(rows))
			assert(strings.TrimSpace(interfaceString(rows[0]["label"])) == "alpha", "expected sqlite first row label alpha, got %v", rows[0]["label"])
			assert(strings.TrimSpace(interfaceString(rows[1]["label"])) == "beta", "expected sqlite second row label beta, got %v", rows[1]["label"])
			logf("verified denied sqlite mutation left proof data unchanged")
		},
		Cleanup: noopCleanup,
	}
}

func setupPostgresConnectorGatewayProofFixture(runRoot string, logf func(string)) connectorGatewayProofFixture {
	containerName := "epydios-mcp-postgres-proof-" + strings.ToLower(strings.TrimPrefix(filepath.Base(runRoot), "20"))
	hostPort := reserveLoopbackPort()
	connectionURI := fmt.Sprintf("postgres://postgres:proof-pass@127.0.0.1:%d/proofdb?sslmode=disable", hostPort)

	runLoggedCommand(logf, "docker", "run", "--rm", "-d",
		"--name", containerName,
		"-e", "POSTGRES_PASSWORD=proof-pass",
		"-e", "POSTGRES_DB=proofdb",
		"-p", fmt.Sprintf("127.0.0.1:%d:5432", hostPort),
		"postgres:16-alpine",
	)
	waitForPostgresReady(connectionURI, 90*time.Second, logf)
	seedPostgresProofDatabase(connectionURI, logf)

	return connectorGatewayProofFixture{
		Driver:         proofConnectorDriverPostgres,
		ConnectorID:    "postgres-proof",
		ConnectorLabel: "Postgres proof",
		PhaseDirName:   "mcp-postgres-gateway-proof",
		VerifyBasename: "verify-mcp-postgres-gateway",
		SummaryStatus:  "bounded_host_facing_postgres_mcp_beta_proof",
		TokenValue:     "phase2-postgres-proof-token",
		ShimClientName: "Epydios MCP Postgres Shim",
		ShimServerName: "epydios-mcp-postgres",
		Settings: map[string]interface{}{
			"selectedConnectorId": "postgres-proof",
			"profiles": []map[string]interface{}{{
				"id":            "postgres-proof",
				"label":         "Postgres proof",
				"driver":        proofConnectorDriverPostgres,
				"connectionUri": connectionURI,
				"allowedTools":  []string{"query_read_only"},
				"enabled":       true,
			}},
		},
		ExpectedToolNames: []string{"query_read_only"},
		AllowedCalls: []connectorGatewayProofCall{{
			ToolName: "query_read_only",
			Arguments: map[string]interface{}{
				"query": "SELECT id, label FROM proof_items WHERE label = 'alpha' ORDER BY id LIMIT 1;",
			},
			AssertStructuredFunc: func(structured map[string]interface{}, logf func(string)) {
				allowNestedResult, _ := structured["result"].(map[string]interface{})
				allowRowCount, _ := numericValue(allowNestedResult["rowCount"])
				assert(allowRowCount == 1, "expected allowed tools/call rowCount 1, got %d", allowRowCount)
			},
		}},
		DeniedCall: connectorGatewayProofCall{
			ToolName:      "query_read_only",
			ExpectedClass: "mutation",
			Arguments: map[string]interface{}{
				"query": "DELETE FROM proof_items WHERE label = 'alpha';",
			},
		},
		SummaryMetadata: map[string]any{
			"connector_driver": proofConnectorDriverPostgres,
			"connector_family": "postgres",
		},
		AssertDataUnchanged: func(logf func(string)) {
			rows := queryPostgresRows(connectionURI, "SELECT id, label FROM proof_items ORDER BY id;", logf)
			assert(len(rows) == 2, "expected postgres proof_items row count 2 after denied mutation, got %d", len(rows))
			assert(strings.TrimSpace(interfaceString(rows[0]["label"])) == "alpha", "expected postgres first row label alpha, got %v", rows[0]["label"])
			assert(strings.TrimSpace(interfaceString(rows[1]["label"])) == "beta", "expected postgres second row label beta, got %v", rows[1]["label"])
			logf("verified denied postgres mutation left proof data unchanged")
		},
		Cleanup: func(logf func(string)) {
			_, _ = tryLoggedCommand(logf, "docker", "rm", "-f", containerName)
		},
	}
}

func setupFilesystemConnectorGatewayProofFixture(runRoot string, logf func(string)) connectorGatewayProofFixture {
	rootPath := filepath.Join(runRoot, "filesystem-root")
	createFilesystemProofRoot(rootPath)
	return connectorGatewayProofFixture{
		Driver:         proofConnectorDriverFilesystem,
		ConnectorID:    "filesystem-proof",
		ConnectorLabel: "Filesystem proof",
		PhaseDirName:   "mcp-filesystem-gateway-proof",
		VerifyBasename: "verify-mcp-filesystem-gateway",
		SummaryStatus:  "bounded_host_facing_filesystem_mcp_beta_proof",
		TokenValue:     "phase2-filesystem-proof-token",
		ShimClientName: "Epydios MCP Filesystem Shim",
		ShimServerName: "epydios-mcp-filesystem",
		Settings: map[string]interface{}{
			"selectedConnectorId": "filesystem-proof",
			"profiles": []map[string]interface{}{{
				"id":           "filesystem-proof",
				"label":        "Filesystem proof",
				"driver":       proofConnectorDriverFilesystem,
				"rootPath":     rootPath,
				"allowedTools": []string{"read_text", "list_directory"},
				"enabled":      true,
			}},
		},
		ExpectedToolNames: []string{"list_directory", "read_text"},
		AllowedCalls: []connectorGatewayProofCall{
			{
				ToolName: "read_text",
				Arguments: map[string]interface{}{
					"path": "notes/alpha.txt",
				},
				AssertStructuredFunc: func(structured map[string]interface{}, logf func(string)) {
					allowNestedResult, _ := structured["result"].(map[string]interface{})
					bytesRead, _ := numericValue(allowNestedResult["bytesRead"])
					assert(bytesRead > 0, "expected allowed read_text bytesRead > 0, got %d", bytesRead)
					assert(strings.TrimSpace(interfaceString(allowNestedResult["relativePath"])) == "notes/alpha.txt", "expected allowed read_text relativePath notes/alpha.txt, got %v", allowNestedResult["relativePath"])
				},
			},
			{
				ToolName: "list_directory",
				Arguments: map[string]interface{}{
					"path": "notes",
				},
				AssertStructuredFunc: func(structured map[string]interface{}, logf func(string)) {
					allowNestedResult, _ := structured["result"].(map[string]interface{})
					entryCount, _ := numericValue(allowNestedResult["entryCount"])
					assert(entryCount == 2, "expected allowed list_directory entryCount 2, got %d", entryCount)
					assert(strings.TrimSpace(interfaceString(allowNestedResult["relativePath"])) == "notes", "expected allowed list_directory relativePath notes, got %v", allowNestedResult["relativePath"])
				},
			},
		},
		DeniedCall: connectorGatewayProofCall{
			ToolName:      "read_text",
			ExpectedClass: "path_traversal",
			Arguments: map[string]interface{}{
				"path": "../secret.txt",
			},
		},
		SummaryMetadata: map[string]any{
			"connector_driver": proofConnectorDriverFilesystem,
			"connector_family": "filesystem",
		},
		AssertDataUnchanged: func(logf func(string)) {
			content, err := os.ReadFile(filepath.Join(rootPath, "notes", "alpha.txt"))
			must(err)
			assert(strings.Contains(string(content), "alpha filesystem proof"), "expected filesystem proof file contents to remain unchanged")
			logf("verified denied filesystem traversal left proof data unchanged")
		},
		Cleanup: noopCleanup,
	}
}

func setupGitHubConnectorGatewayProofFixture(_ string, logf func(string)) connectorGatewayProofFixture {
	var mockCallCount int
	mockServer := newLoopbackServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if got := strings.TrimSpace(r.Header.Get("Authorization")); got != "Bearer github-proof-token" {
			http.Error(w, "missing token", http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/repos/epydios/epydios-agentops-control-plane/pulls/21" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		mockCallCount++
		writeJSONResponse(w, map[string]interface{}{
			"title":    "Bounded GitHub connector proof",
			"state":    "open",
			"html_url": "https://github.local/epydios/epydios-agentops-control-plane/pull/21",
			"draft":    false,
			"merged":   false,
			"user": map[string]interface{}{
				"login": "proof-user",
			},
		})
	}))
	logf("started mock GitHub API on " + mockServer.URL)

	return connectorGatewayProofFixture{
		Driver:         proofConnectorDriverGitHub,
		ConnectorID:    "github-proof",
		ConnectorLabel: "GitHub proof",
		PhaseDirName:   "mcp-github-gateway-proof",
		VerifyBasename: "verify-mcp-github-gateway",
		SummaryStatus:  "bounded_host_facing_github_mcp_beta_proof",
		TokenValue:     "phase2-github-proof-token",
		ShimClientName: "Epydios MCP GitHub Shim",
		ShimServerName: "epydios-mcp-github",
		Settings: map[string]interface{}{
			"selectedConnectorId": "github-proof",
			"profiles": []map[string]interface{}{{
				"id":            "github-proof",
				"label":         "GitHub proof",
				"driver":        proofConnectorDriverGitHub,
				"endpointRef":   "ref://projects/{projectId}/providers/github/endpoint",
				"credentialRef": "ref://projects/{projectId}/providers/github/token",
				"allowedTools":  []string{"get_pull_request"},
				"allowedOwners": []string{"epydios"},
				"allowedRepos":  []string{"epydios/epydios-agentops-control-plane"},
				"enabled":       true,
			}},
		},
		RuntimeRefValues: map[string]interface{}{
			"ref://projects/project-a/providers/github/endpoint": mockServer.URL,
			"ref://projects/project-a/providers/github/token":    "github-proof-token",
		},
		ExpectedToolNames: []string{"get_pull_request"},
		AllowedCalls: []connectorGatewayProofCall{{
			ToolName: "get_pull_request",
			Arguments: map[string]interface{}{
				"owner":       "epydios",
				"repo":        "epydios-agentops-control-plane",
				"pull_number": 21,
			},
			AssertStructuredFunc: func(structured map[string]interface{}, logf func(string)) {
				allowNestedResult, _ := structured["result"].(map[string]interface{})
				assert(strings.TrimSpace(interfaceString(allowNestedResult["pullTitle"])) == "Bounded GitHub connector proof", "expected allowed get_pull_request title, got %v", allowNestedResult["pullTitle"])
				assert(strings.TrimSpace(interfaceString(allowNestedResult["owner"])) == "epydios", "expected allowed get_pull_request owner epydios, got %v", allowNestedResult["owner"])
			},
		}},
		DeniedCall: connectorGatewayProofCall{
			ToolName:      "get_pull_request",
			ExpectedClass: "repo_out_of_scope",
			Arguments: map[string]interface{}{
				"owner":       "outside-org",
				"repo":        "secret-repo",
				"pull_number": 22,
			},
		},
		SummaryMetadata: map[string]any{
			"connector_driver": proofConnectorDriverGitHub,
			"connector_family": "github",
		},
		AssertDataUnchanged: func(logf func(string)) {
			assert(mockCallCount == 1, "expected exactly one executed GitHub API call after denied out-of-scope request, got %d", mockCallCount)
			logf("verified denied GitHub out-of-scope request never reached the mock GitHub API")
		},
		Cleanup: func(logf func(string)) {
			mockServer.Close()
		},
	}
}

func setupBrowserConnectorGatewayProofFixture(_ string, logf func(string)) connectorGatewayProofFixture {
	var allowedCallCount int
	var blockedCallCount int
	var destructiveClickCount int

	blockedServer := newLoopbackServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		blockedCallCount++
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		writeJSONResponse(w, map[string]interface{}{
			"blocked": true,
		})
	}))
	logf("started blocked browser origin on " + blockedServer.URL)

	var pageServer *loopbackServer
	pageServer = newLoopbackServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/articles/proof":
			allowedCallCount++
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<html><head><title>Bounded Browser Proof</title></head><body><main><h1>alpha browser proof</h1><p>browser text extraction is read only</p><button id=\"delete-button\" formaction=\"/danger/delete\" formmethod=\"post\">Delete draft</button></main></body></html>"))
		case "/danger/delete":
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			destructiveClickCount++
			http.Redirect(w, r, pageServer.URL+"/articles/deleted", http.StatusSeeOther)
		case "/articles/deleted":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<html><head><title>Deleted</title></head><body><main><h1>draft deleted</h1></main></body></html>"))
		case "/redirect-out":
			http.Redirect(w, r, blockedServer.URL+"/blocked", http.StatusFound)
		default:
			http.NotFound(w, r)
		}
	}))
	logf("started bounded browser origin on " + pageServer.URL)

	return connectorGatewayProofFixture{
		Driver:         proofConnectorDriverBrowser,
		ConnectorID:    "browser-proof",
		ConnectorLabel: "Browser proof",
		PhaseDirName:   "mcp-browser-gateway-proof",
		VerifyBasename: "verify-mcp-browser-gateway",
		SummaryStatus:  "bounded_host_facing_browser_destructive_click_mcp_beta_proof",
		TokenValue:     "phase2-browser-proof-token",
		ShimClientName: "Epydios MCP Browser Shim",
		ShimServerName: "epydios-mcp-browser",
		Settings: map[string]interface{}{
			"selectedConnectorId": "browser-proof",
			"profiles": []map[string]interface{}{{
				"id":             "browser-proof",
				"label":          "Browser proof",
				"driver":         proofConnectorDriverBrowser,
				"allowedTools":   []string{"get_page_metadata", "extract_text", "click_destructive_button"},
				"allowedOrigins": []string{pageServer.URL},
				"enabled":        true,
			}},
		},
		ExpectedToolNames: []string{"click_destructive_button", "extract_text", "get_page_metadata"},
		AllowedCalls: []connectorGatewayProofCall{
			{
				ToolName: "get_page_metadata",
				Arguments: map[string]interface{}{
					"url": pageServer.URL + "/articles/proof",
				},
				AssertStructuredFunc: func(structured map[string]interface{}, logf func(string)) {
					allowNestedResult, _ := structured["result"].(map[string]interface{})
					assert(strings.TrimSpace(interfaceString(allowNestedResult["pageTitle"])) == "Bounded Browser Proof", "expected allowed get_page_metadata pageTitle, got %v", allowNestedResult["pageTitle"])
				},
			},
			{
				ToolName: "extract_text",
				Arguments: map[string]interface{}{
					"url": pageServer.URL + "/articles/proof",
				},
				AssertStructuredFunc: func(structured map[string]interface{}, logf func(string)) {
					allowNestedResult, _ := structured["result"].(map[string]interface{})
					textPreview := strings.TrimSpace(interfaceString(allowNestedResult["textPreview"]))
					assert(strings.Contains(textPreview, "alpha browser proof"), "expected allowed extract_text preview to contain alpha browser proof, got %q", textPreview)
				},
			},
		},
		ApprovalCall: &connectorGatewayApprovalProofCall{
			ToolName:              "click_destructive_button",
			ExpectedDeferredClass: "destructive_button_click",
			Arguments: map[string]interface{}{
				"url":            pageServer.URL + "/articles/proof",
				"selector":       "#delete-button",
				"expected_label": "Delete draft",
			},
			AssertStructuredFunc: func(structured map[string]interface{}, logf func(string)) {
				allowNestedResult, _ := structured["result"].(map[string]interface{})
				assert(truthy(allowNestedResult["clicked"]), "expected approved browser click result clicked=true, got %+v", allowNestedResult)
				assert(strings.TrimSpace(interfaceString(allowNestedResult["resolvedLabel"])) == "Delete draft", "expected approved browser click resolvedLabel Delete draft, got %v", allowNestedResult["resolvedLabel"])
				assert(strings.TrimSpace(interfaceString(allowNestedResult["postClickFinalUrl"])) == pageServer.URL+"/articles/deleted", "expected approved browser click postClickFinalUrl %s, got %v", pageServer.URL+"/articles/deleted", allowNestedResult["postClickFinalUrl"])
			},
		},
		DeniedCall: connectorGatewayProofCall{
			ToolName:      "get_page_metadata",
			ExpectedClass: "redirect_out_of_scope",
			Arguments: map[string]interface{}{
				"url": pageServer.URL + "/redirect-out",
			},
		},
		SummaryMetadata: map[string]any{
			"connector_driver": proofConnectorDriverBrowser,
			"connector_family": "browser",
		},
		AssertDataUnchanged: func(logf func(string)) {
			assert(allowedCallCount >= 2, "expected at least two allowed browser page requests, got %d", allowedCallCount)
			assert(blockedCallCount == 0, "expected denied browser redirect to never reach the blocked origin, got %d", blockedCallCount)
			assert(destructiveClickCount == 1, "expected exactly one destructive browser click after approval, got %d", destructiveClickCount)
			logf("verified denied browser redirect never reached the blocked origin and the destructive browser click executed exactly once after approval")
		},
		Cleanup: func(logf func(string)) {
			pageServer.Close()
			blockedServer.Close()
		},
	}
}

func noopCleanup(func(string)) {}

func writeJSONResponse(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func createSQLiteProofDatabase(dbPath string, logf func(string)) {
	cmd := exec.Command(
		"sqlite3",
		dbPath,
		"CREATE TABLE proof_items (id INTEGER PRIMARY KEY, label TEXT NOT NULL);"+
			"INSERT INTO proof_items(label) VALUES ('alpha');"+
			"INSERT INTO proof_items(label) VALUES ('beta');",
	)
	logf("$ " + strings.Join(cmd.Args, " "))
	output, err := cmd.CombinedOutput()
	if len(output) > 0 {
		logf(strings.TrimSpace(string(output)))
	}
	if err != nil {
		panic(fmt.Sprintf("create sqlite proof db: %v", err))
	}
}

func createFilesystemProofRoot(rootPath string) {
	must(os.MkdirAll(filepath.Join(rootPath, "notes"), 0o755))
	must(os.WriteFile(filepath.Join(rootPath, "notes", "alpha.txt"), []byte("alpha filesystem proof\n"), 0o644))
	must(os.WriteFile(filepath.Join(rootPath, "notes", "beta.txt"), []byte("beta filesystem proof\n"), 0o644))
}

func querySQLiteRows(dbPath, query string, logf func(string)) []map[string]interface{} {
	cmd := exec.Command("sqlite3", "-readonly", "-json", dbPath, query)
	logf("$ " + strings.Join(cmd.Args, " "))
	output, err := cmd.CombinedOutput()
	if len(output) > 0 {
		logf(strings.TrimSpace(string(output)))
	}
	if err != nil {
		panic(fmt.Sprintf("query sqlite rows: %v", err))
	}
	if len(strings.TrimSpace(string(output))) == 0 {
		return nil
	}
	var rows []map[string]interface{}
	must(json.Unmarshal(output, &rows))
	return rows
}

func reserveLoopbackPort() int {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	must(err)
	defer listener.Close()
	addr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		panic("unable to reserve loopback port")
	}
	return addr.Port
}

func waitForPostgresReady(connectionURI string, timeout time.Duration, logf func(string)) {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		cfg, err := pgxpool.ParseConfig(connectionURI)
		if err == nil {
			cfg.MaxConns = 1
			cfg.MinConns = 0
			pool, openErr := pgxpool.NewWithConfig(ctx, cfg)
			if openErr == nil {
				pingErr := pool.Ping(ctx)
				pool.Close()
				if pingErr == nil {
					cancel()
					logf("postgres proof container is ready")
					return
				}
				lastErr = pingErr
			} else {
				lastErr = openErr
			}
		} else {
			lastErr = err
		}
		cancel()
		time.Sleep(1 * time.Second)
	}
	panic(fmt.Sprintf("timed out waiting for postgres proof container readiness: %v", lastErr))
}

func seedPostgresProofDatabase(connectionURI string, logf func(string)) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cfg, err := pgxpool.ParseConfig(connectionURI)
	must(err)
	cfg.MaxConns = 1
	cfg.MinConns = 0
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	must(err)
	defer pool.Close()
	seedSQL := strings.Join([]string{
		"DROP TABLE IF EXISTS proof_items;",
		"CREATE TABLE proof_items (id SERIAL PRIMARY KEY, label TEXT NOT NULL);",
		"INSERT INTO proof_items(label) VALUES ('alpha');",
		"INSERT INTO proof_items(label) VALUES ('beta');",
	}, " ")
	logf("$ postgres seed => " + seedSQL)
	_, err = pool.Exec(ctx, seedSQL)
	must(err)
}

func queryPostgresRows(connectionURI, query string, logf func(string)) []map[string]interface{} {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cfg, err := pgxpool.ParseConfig(connectionURI)
	must(err)
	cfg.MaxConns = 1
	cfg.MinConns = 0
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	must(err)
	defer pool.Close()
	logf("$ postgres query => " + query)
	rows, err := pool.Query(ctx, query)
	must(err)
	defer rows.Close()
	descriptions := rows.FieldDescriptions()
	items := make([]map[string]interface{}, 0)
	for rows.Next() {
		values, err := rows.Values()
		must(err)
		item := make(map[string]interface{}, len(values))
		for idx, value := range values {
			columnName := fmt.Sprintf("column_%d", idx)
			if idx < len(descriptions) && len(descriptions[idx].Name) > 0 {
				columnName = string(descriptions[idx].Name)
			}
			switch typed := value.(type) {
			case []byte:
				item[columnName] = string(typed)
			default:
				item[columnName] = typed
			}
		}
		items = append(items, item)
	}
	must(rows.Err())
	return items
}

func runLoggedCommand(logf func(string), name string, args ...string) string {
	output, err := tryLoggedCommand(logf, name, args...)
	if err != nil {
		panic(fmt.Sprintf("%s failed: %v", strings.Join(append([]string{name}, args...), " "), err))
	}
	return output
}

func tryLoggedCommand(logf func(string), name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	logf("$ " + strings.Join(cmd.Args, " "))
	output, err := cmd.CombinedOutput()
	if trimmed := strings.TrimSpace(string(output)); trimmed != "" {
		logf(trimmed)
	}
	return strings.TrimSpace(string(output)), err
}

func assignJSON(out interface{}, payload interface{}) error {
	if out == nil {
		return nil
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return json.Unmarshal(encoded, out)
}

func decodeJSON(in interface{}, out interface{}) error {
	encoded, err := json.Marshal(in)
	if err != nil {
		return err
	}
	return json.Unmarshal(encoded, out)
}

func cloneRunRecord(in *runtimeapi.RunRecord) *runtimeapi.RunRecord {
	if in == nil {
		return nil
	}
	encoded := mustJSONBytes(in)
	var out runtimeapi.RunRecord
	must(json.Unmarshal(encoded, &out))
	return &out
}

func cloneIntegrationSettingsRecord(in *runtimeapi.IntegrationSettingsRecord) *runtimeapi.IntegrationSettingsRecord {
	if in == nil {
		return nil
	}
	encoded := mustJSONBytes(in)
	var out runtimeapi.IntegrationSettingsRecord
	must(json.Unmarshal(encoded, &out))
	return &out
}

func cloneConnectorSettingsRecord(in *runtimeapi.ConnectorSettingsRecord) *runtimeapi.ConnectorSettingsRecord {
	if in == nil {
		return nil
	}
	encoded := mustJSONBytes(in)
	var out runtimeapi.ConnectorSettingsRecord
	must(json.Unmarshal(encoded, &out))
	return &out
}

func integrationSettingsKey(tenantID, projectID string) string {
	return strings.TrimSpace(tenantID) + "::" + strings.TrimSpace(projectID)
}

func writeJSON(path string, value interface{}) {
	encoded, err := json.MarshalIndent(value, "", "  ")
	must(err)
	must(os.WriteFile(path, append(encoded, '\n'), 0o644))
}

func copyFile(src, dst string) {
	content, err := os.ReadFile(src)
	must(err)
	must(os.WriteFile(dst, content, 0o644))
}

func interfaceString(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return fmt.Sprintf("%v", value)
	}
}

func mustJSONBytes(v interface{}) []byte {
	encoded, err := json.Marshal(v)
	must(err)
	return encoded
}

func assert(condition bool, format string, args ...interface{}) {
	if condition {
		return
	}
	panic(fmt.Sprintf(format, args...))
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
