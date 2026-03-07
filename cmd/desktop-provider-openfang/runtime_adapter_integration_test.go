package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	rt "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

const runtimeAdapterScreenshotHash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

type runtimeAdapterRunStore struct {
	mu                  sync.RWMutex
	runs                map[string]*rt.RunRecord
	integrationSettings map[string]*rt.IntegrationSettingsRecord
	tasks               map[string]*rt.TaskRecord
	sessions            map[string]*rt.SessionRecord
	sessionWorkers      map[string]*rt.SessionWorkerRecord
	toolActions         map[string]*rt.ToolActionRecord
	sessionEvents       map[string][]rt.SessionEventRecord
	approvalCheckpoints map[string]*rt.ApprovalCheckpointRecord
	evidenceRecords     map[string]*rt.EvidenceRecord
}

func newRuntimeAdapterRunStore() *runtimeAdapterRunStore {
	return &runtimeAdapterRunStore{
		runs:                make(map[string]*rt.RunRecord),
		integrationSettings: make(map[string]*rt.IntegrationSettingsRecord),
		tasks:               make(map[string]*rt.TaskRecord),
		sessions:            make(map[string]*rt.SessionRecord),
		sessionWorkers:      make(map[string]*rt.SessionWorkerRecord),
		toolActions:         make(map[string]*rt.ToolActionRecord),
		sessionEvents:       make(map[string][]rt.SessionEventRecord),
		approvalCheckpoints: make(map[string]*rt.ApprovalCheckpointRecord),
		evidenceRecords:     make(map[string]*rt.EvidenceRecord),
	}
}

func (s *runtimeAdapterRunStore) Ping(context.Context) error { return nil }

func (s *runtimeAdapterRunStore) EnsureSchema(context.Context) error { return nil }

func (s *runtimeAdapterRunStore) UpsertRun(_ context.Context, run *rt.RunRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.RunID] = cloneRuntimeRunRecord(run)
	return nil
}

func (s *runtimeAdapterRunStore) GetRun(_ context.Context, runID string) (*rt.RunRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	run, ok := s.runs[runID]
	if !ok {
		return nil, fmt.Errorf("run %s not found", runID)
	}
	return cloneRuntimeRunRecord(run), nil
}

func (s *runtimeAdapterRunStore) ListRuns(_ context.Context, _ rt.RunListQuery) ([]rt.RunSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]rt.RunSummary, 0, len(s.runs))
	for _, run := range s.runs {
		items = append(items, rt.RunSummary{
			RunID:                    run.RunID,
			RequestID:                run.RequestID,
			TenantID:                 run.TenantID,
			ProjectID:                run.ProjectID,
			Environment:              run.Environment,
			RetentionClass:           run.RetentionClass,
			ExpiresAt:                run.ExpiresAt,
			Status:                   run.Status,
			SelectedProfileProvider:  run.SelectedProfileProvider,
			SelectedPolicyProvider:   run.SelectedPolicyProvider,
			SelectedEvidenceProvider: run.SelectedEvidenceProvider,
			SelectedDesktopProvider:  run.SelectedDesktopProvider,
			PolicyDecision:           run.PolicyDecision,
			PolicyBundleID:           run.PolicyBundleID,
			PolicyBundleVersion:      run.PolicyBundleVersion,
			PolicyGrantTokenPresent:  run.PolicyGrantTokenPresent,
			PolicyGrantTokenSHA256:   run.PolicyGrantTokenSHA256,
			CreatedAt:                run.CreatedAt,
			UpdatedAt:                run.UpdatedAt,
		})
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})
	return items, nil
}

func (s *runtimeAdapterRunStore) PruneRuns(_ context.Context, query rt.RunPruneQuery) (*rt.RunPruneResult, error) {
	return &rt.RunPruneResult{
		DryRun:         query.DryRun,
		Before:         query.Before,
		RetentionClass: query.RetentionClass,
		Limit:          query.Limit,
	}, nil
}

func (s *runtimeAdapterRunStore) UpsertIntegrationSettings(_ context.Context, record *rt.IntegrationSettingsRecord) error {
	if record == nil {
		return fmt.Errorf("integration settings record is required")
	}
	tenantID := strings.TrimSpace(record.TenantID)
	projectID := strings.TrimSpace(record.ProjectID)
	if tenantID == "" {
		return fmt.Errorf("integration settings tenantId is required")
	}
	if projectID == "" {
		return fmt.Errorf("integration settings projectId is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	key := tenantID + "::" + projectID
	s.integrationSettings[key] = cloneRuntimeIntegrationSettingsRecord(record)
	return nil
}

func (s *runtimeAdapterRunStore) GetIntegrationSettings(_ context.Context, tenantID, projectID string) (*rt.IntegrationSettingsRecord, error) {
	tenantID = strings.TrimSpace(tenantID)
	projectID = strings.TrimSpace(projectID)
	if tenantID == "" {
		return nil, fmt.Errorf("integration settings tenantId is required")
	}
	if projectID == "" {
		return nil, fmt.Errorf("integration settings projectId is required")
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	key := tenantID + "::" + projectID
	record, ok := s.integrationSettings[key]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneRuntimeIntegrationSettingsRecord(record), nil
}

func (s *runtimeAdapterRunStore) UpsertTask(_ context.Context, record *rt.TaskRecord) error {
	if record == nil {
		return fmt.Errorf("task record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tasks[record.TaskID] = cloneRuntimeTaskRecord(record)
	return nil
}

func (s *runtimeAdapterRunStore) GetTask(_ context.Context, taskID string) (*rt.TaskRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.tasks[strings.TrimSpace(taskID)]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneRuntimeTaskRecord(record), nil
}

func (s *runtimeAdapterRunStore) ListTasks(_ context.Context, query rt.TaskListQuery) ([]rt.TaskRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]rt.TaskRecord, 0, len(s.tasks))
	for _, record := range s.tasks {
		if query.TenantID != "" && record.TenantID != query.TenantID {
			continue
		}
		if query.ProjectID != "" && record.ProjectID != query.ProjectID {
			continue
		}
		if query.Status != "" && string(record.Status) != query.Status {
			continue
		}
		items = append(items, *cloneRuntimeTaskRecord(record))
	}
	return items, nil
}

func (s *runtimeAdapterRunStore) UpsertSession(_ context.Context, record *rt.SessionRecord) error {
	if record == nil {
		return fmt.Errorf("session record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[record.SessionID] = cloneRuntimeSessionRecord(record)
	return nil
}

func (s *runtimeAdapterRunStore) GetSession(_ context.Context, sessionID string) (*rt.SessionRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.sessions[strings.TrimSpace(sessionID)]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneRuntimeSessionRecord(record), nil
}

func (s *runtimeAdapterRunStore) ListSessions(_ context.Context, query rt.SessionListQuery) ([]rt.SessionRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]rt.SessionRecord, 0, len(s.sessions))
	for _, record := range s.sessions {
		if query.TaskID != "" && record.TaskID != query.TaskID {
			continue
		}
		if query.TenantID != "" && record.TenantID != query.TenantID {
			continue
		}
		if query.ProjectID != "" && record.ProjectID != query.ProjectID {
			continue
		}
		if query.Status != "" && string(record.Status) != query.Status {
			continue
		}
		if query.SessionType != "" && record.SessionType != query.SessionType {
			continue
		}
		items = append(items, *cloneRuntimeSessionRecord(record))
	}
	return items, nil
}

func (s *runtimeAdapterRunStore) UpsertSessionWorker(_ context.Context, record *rt.SessionWorkerRecord) error {
	if record == nil {
		return fmt.Errorf("session worker record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessionWorkers[record.WorkerID] = cloneRuntimeSessionWorkerRecord(record)
	return nil
}

func (s *runtimeAdapterRunStore) ListSessionWorkers(_ context.Context, query rt.SessionWorkerListQuery) ([]rt.SessionWorkerRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]rt.SessionWorkerRecord, 0, len(s.sessionWorkers))
	for _, record := range s.sessionWorkers {
		if query.SessionID != "" && record.SessionID != query.SessionID {
			continue
		}
		if query.TenantID != "" && record.TenantID != query.TenantID {
			continue
		}
		if query.ProjectID != "" && record.ProjectID != query.ProjectID {
			continue
		}
		if query.Status != "" && string(record.Status) != query.Status {
			continue
		}
		if query.WorkerType != "" && record.WorkerType != query.WorkerType {
			continue
		}
		items = append(items, *cloneRuntimeSessionWorkerRecord(record))
	}
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func (s *runtimeAdapterRunStore) UpsertToolAction(_ context.Context, record *rt.ToolActionRecord) error {
	if record == nil {
		return fmt.Errorf("tool action record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.toolActions[record.ToolActionID] = cloneRuntimeToolActionRecord(record)
	return nil
}

func (s *runtimeAdapterRunStore) ListToolActions(_ context.Context, query rt.ToolActionListQuery) ([]rt.ToolActionRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]rt.ToolActionRecord, 0, len(s.toolActions))
	for _, record := range s.toolActions {
		if query.SessionID != "" && record.SessionID != query.SessionID {
			continue
		}
		if query.TenantID != "" && record.TenantID != query.TenantID {
			continue
		}
		if query.ProjectID != "" && record.ProjectID != query.ProjectID {
			continue
		}
		if query.WorkerID != "" && record.WorkerID != query.WorkerID {
			continue
		}
		if query.ToolType != "" && record.ToolType != query.ToolType {
			continue
		}
		if query.Status != "" && record.Status != query.Status {
			continue
		}
		items = append(items, *cloneRuntimeToolActionRecord(record))
	}
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func (s *runtimeAdapterRunStore) AppendSessionEvent(_ context.Context, record *rt.SessionEventRecord) error {
	if record == nil {
		return fmt.Errorf("session event record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	event := cloneRuntimeSessionEventRecord(record)
	if event.Sequence <= 0 {
		event.Sequence = int64(len(s.sessionEvents[event.SessionID]) + 1)
	}
	if strings.TrimSpace(event.EventID) == "" {
		event.EventID = fmt.Sprintf("%s-event-%d", event.SessionID, event.Sequence)
	}
	s.sessionEvents[event.SessionID] = append(s.sessionEvents[event.SessionID], *event)
	return nil
}

func (s *runtimeAdapterRunStore) ListSessionEvents(_ context.Context, query rt.SessionEventListQuery) ([]rt.SessionEventRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]rt.SessionEventRecord, 0, len(s.sessionEvents[query.SessionID]))
	for _, record := range s.sessionEvents[query.SessionID] {
		if query.AfterSequence > 0 && record.Sequence <= query.AfterSequence {
			continue
		}
		items = append(items, *cloneRuntimeSessionEventRecord(&record))
	}
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func (s *runtimeAdapterRunStore) UpsertApprovalCheckpoint(_ context.Context, record *rt.ApprovalCheckpointRecord) error {
	if record == nil {
		return fmt.Errorf("approval checkpoint record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.approvalCheckpoints[record.CheckpointID] = cloneRuntimeApprovalCheckpointRecord(record)
	return nil
}

func (s *runtimeAdapterRunStore) ListApprovalCheckpoints(_ context.Context, query rt.ApprovalCheckpointListQuery) ([]rt.ApprovalCheckpointRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]rt.ApprovalCheckpointRecord, 0, len(s.approvalCheckpoints))
	for _, record := range s.approvalCheckpoints {
		if query.CheckpointID != "" && record.CheckpointID != query.CheckpointID {
			continue
		}
		if query.SessionID != "" && record.SessionID != query.SessionID {
			continue
		}
		if query.TenantID != "" && record.TenantID != query.TenantID {
			continue
		}
		if query.ProjectID != "" && record.ProjectID != query.ProjectID {
			continue
		}
		if query.Status != "" && record.Status != query.Status {
			continue
		}
		items = append(items, *cloneRuntimeApprovalCheckpointRecord(record))
	}
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func (s *runtimeAdapterRunStore) UpsertEvidenceRecord(_ context.Context, record *rt.EvidenceRecord) error {
	if record == nil {
		return fmt.Errorf("evidence record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.evidenceRecords[record.EvidenceID] = cloneRuntimeEvidenceRecord(record)
	return nil
}

func (s *runtimeAdapterRunStore) ListEvidenceRecords(_ context.Context, query rt.EvidenceRecordListQuery) ([]rt.EvidenceRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]rt.EvidenceRecord, 0, len(s.evidenceRecords))
	for _, record := range s.evidenceRecords {
		if query.SessionID != "" && record.SessionID != query.SessionID {
			continue
		}
		if query.TenantID != "" && record.TenantID != query.TenantID {
			continue
		}
		if query.ProjectID != "" && record.ProjectID != query.ProjectID {
			continue
		}
		if query.Kind != "" && record.Kind != query.Kind {
			continue
		}
		if query.RetentionClass != "" && record.RetentionClass != query.RetentionClass {
			continue
		}
		items = append(items, *cloneRuntimeEvidenceRecord(record))
	}
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func cloneRuntimeRunRecord(in *rt.RunRecord) *rt.RunRecord {
	if in == nil {
		return nil
	}
	out := *in
	if in.ExpiresAt != nil {
		t := *in.ExpiresAt
		out.ExpiresAt = &t
	}
	out.RequestPayload = cloneRuntimeBytes(in.RequestPayload)
	out.ProfileResponse = cloneRuntimeBytes(in.ProfileResponse)
	out.PolicyResponse = cloneRuntimeBytes(in.PolicyResponse)
	out.DesktopObserveResponse = cloneRuntimeBytes(in.DesktopObserveResponse)
	out.DesktopActuateResponse = cloneRuntimeBytes(in.DesktopActuateResponse)
	out.DesktopVerifyResponse = cloneRuntimeBytes(in.DesktopVerifyResponse)
	out.EvidenceRecordResponse = cloneRuntimeBytes(in.EvidenceRecordResponse)
	out.EvidenceBundleResponse = cloneRuntimeBytes(in.EvidenceBundleResponse)
	return &out
}

func cloneRuntimeBytes(in []byte) []byte {
	if in == nil {
		return nil
	}
	out := make([]byte, len(in))
	copy(out, in)
	return out
}

func cloneRuntimeIntegrationSettingsRecord(in *rt.IntegrationSettingsRecord) *rt.IntegrationSettingsRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.Settings = cloneRuntimeBytes(in.Settings)
	return &out
}

func cloneRuntimeTaskRecord(in *rt.TaskRecord) *rt.TaskRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.RequestedBy = cloneRuntimeBytes(in.RequestedBy)
	out.Annotations = cloneRuntimeBytes(in.Annotations)
	return &out
}

func cloneRuntimeSessionRecord(in *rt.SessionRecord) *rt.SessionRecord {
	if in == nil {
		return nil
	}
	out := *in
	if in.CompletedAt != nil {
		t := *in.CompletedAt
		out.CompletedAt = &t
	}
	out.Summary = cloneRuntimeBytes(in.Summary)
	out.Annotations = cloneRuntimeBytes(in.Annotations)
	return &out
}

func cloneRuntimeSessionWorkerRecord(in *rt.SessionWorkerRecord) *rt.SessionWorkerRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.Capabilities = append([]string(nil), in.Capabilities...)
	out.Annotations = cloneRuntimeBytes(in.Annotations)
	return &out
}

func cloneRuntimeSessionEventRecord(in *rt.SessionEventRecord) *rt.SessionEventRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.Payload = cloneRuntimeBytes(in.Payload)
	return &out
}

func cloneRuntimeApprovalCheckpointRecord(in *rt.ApprovalCheckpointRecord) *rt.ApprovalCheckpointRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.RequestedCapabilities = append([]string(nil), in.RequestedCapabilities...)
	out.RequiredVerifierIDs = append([]string(nil), in.RequiredVerifierIDs...)
	if in.ExpiresAt != nil {
		t := *in.ExpiresAt
		out.ExpiresAt = &t
	}
	if in.ReviewedAt != nil {
		t := *in.ReviewedAt
		out.ReviewedAt = &t
	}
	return &out
}

func cloneRuntimeToolActionRecord(in *rt.ToolActionRecord) *rt.ToolActionRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.RequestPayload = cloneRuntimeBytes(in.RequestPayload)
	out.ResultPayload = cloneRuntimeBytes(in.ResultPayload)
	out.AuditLink = cloneRuntimeBytes(in.AuditLink)
	return &out
}

func cloneRuntimeEvidenceRecord(in *rt.EvidenceRecord) *rt.EvidenceRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.Metadata = cloneRuntimeBytes(in.Metadata)
	return &out
}

type runtimeAdapterProviderClient struct {
	mu             sync.Mutex
	providers      map[string]*rt.ProviderTarget
	caps           map[string][]string
	calls          map[string]int
	desktopHandler http.Handler
}

func newRuntimeAdapterProviderClient(desktopHandler http.Handler) *runtimeAdapterProviderClient {
	providers := map[string]*rt.ProviderTarget{
		"ProfileResolver": {
			Name:         "oss-profile-static",
			Namespace:    "epydios-system",
			ProviderType: "ProfileResolver",
			ProviderID:   "oss-profile-static",
			Priority:     100,
			AuthMode:     "None",
		},
		"PolicyProvider": {
			Name:         "oss-policy-openfang",
			Namespace:    "epydios-system",
			ProviderType: "PolicyProvider",
			ProviderID:   "oss-policy-openfang",
			Priority:     100,
			AuthMode:     "None",
		},
		"EvidenceProvider": {
			Name:         "oss-evidence-memory",
			Namespace:    "epydios-system",
			ProviderType: "EvidenceProvider",
			ProviderID:   "oss-evidence-memory",
			Priority:     100,
			AuthMode:     "None",
		},
		"DesktopProvider": {
			Name:           "oss-desktop-openfang-linux",
			Namespace:      "epydios-system",
			ProviderType:   "DesktopProvider",
			ProviderID:     "oss-desktop-openfang-linux",
			Priority:       80,
			TargetOS:       "linux",
			AuthMode:       "None",
			EndpointURL:    "inmemory://openfang-adapter",
			TimeoutSeconds: 10,
		},
	}

	return &runtimeAdapterProviderClient{
		providers:      providers,
		desktopHandler: desktopHandler,
		caps: map[string][]string{
			"oss-profile-static":         {"profile.resolve"},
			"oss-policy-openfang":        {"policy.evaluate"},
			"oss-evidence-memory":        {"evidence.record"},
			"oss-desktop-openfang-linux": {"observe.window_metadata", "observe.screenshot_hash", "actuate.window_focus", "actuate.input.type_click", "verify.post_action_state"},
		},
		calls: map[string]int{},
	}
}

func (c *runtimeAdapterProviderClient) SelectProvider(_ context.Context, _ string, providerType, requiredCapability, targetOS string, minPriority int64) (*rt.ProviderTarget, error) {
	provider, ok := c.providers[providerType]
	if !ok {
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}
	if provider.Priority < minPriority {
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}
	if requiredCapability != "" && !runtimeAdapterContains(c.caps[provider.Name], requiredCapability) {
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}
	if providerType == "DesktopProvider" {
		normalizedTargetOS := strings.ToLower(strings.TrimSpace(targetOS))
		if normalizedTargetOS != "" {
			providerTargetOS := strings.ToLower(strings.TrimSpace(provider.TargetOS))
			if providerTargetOS == "" {
				providerTargetOS = "linux"
			}
			if normalizedTargetOS != providerTargetOS {
				return nil, fmt.Errorf("no provider found (type=%s capability=%s targetOS=%s minPriority=%d)", providerType, requiredCapability, normalizedTargetOS, minPriority)
			}
		}
	}
	copyProvider := *provider
	return &copyProvider, nil
}

func (c *runtimeAdapterProviderClient) PostJSON(_ context.Context, target *rt.ProviderTarget, path string, reqBody interface{}, out interface{}) error {
	c.mu.Lock()
	c.calls[target.ProviderType+":"+path]++
	c.mu.Unlock()

	switch target.ProviderType {
	case "ProfileResolver":
		if path != "/v1alpha1/profile-resolver/resolve" {
			return fmt.Errorf("unexpected profile path %q", path)
		}
		return runtimeAdapterAssignResponse(out, map[string]interface{}{
			"profileId":      "desktop-sandbox-linux",
			"profileVersion": "v1",
			"source":         "openfang-adapter-runtime-test",
		})
	case "PolicyProvider":
		if path != "/v1alpha1/policy-provider/evaluate" {
			return fmt.Errorf("unexpected policy path %q", path)
		}
		return runtimeAdapterAssignResponse(out, map[string]interface{}{
			"decision": "ALLOW",
			"policyBundle": map[string]interface{}{
				"policyId":      "EPYDIOS_OSS_POLICY_BASELINE",
				"policyVersion": "v1",
			},
			"grantToken": "grant-openfang-adapter-runtime",
		})
	case "EvidenceProvider":
		switch path {
		case "/v1alpha1/evidence-provider/record":
			return runtimeAdapterAssignResponse(out, map[string]interface{}{
				"accepted":   true,
				"evidenceId": "evidence-openfang-adapter-runtime-1",
				"checksum":   runtimeAdapterScreenshotHash,
				"storageUri": "memory://openfang-adapter-runtime/evidence-1",
			})
		case "/v1alpha1/evidence-provider/finalize-bundle":
			return runtimeAdapterAssignResponse(out, map[string]interface{}{
				"bundleId":         "bundle-openfang-adapter-runtime-1",
				"manifestUri":      "memory://openfang-adapter-runtime/bundle-1",
				"manifestChecksum": runtimeAdapterScreenshotHash,
				"itemCount":        1,
			})
		default:
			return fmt.Errorf("unexpected evidence path %q", path)
		}
	case "DesktopProvider":
		body, err := json.Marshal(reqBody)
		if err != nil {
			return fmt.Errorf("marshal desktop request: %w", err)
		}
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		c.desktopHandler.ServeHTTP(rec, req)
		if rec.Code < 200 || rec.Code >= 300 {
			return fmt.Errorf("desktop adapter status=%d body=%s", rec.Code, strings.TrimSpace(rec.Body.String()))
		}
		if out != nil {
			if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
				return fmt.Errorf("decode desktop adapter response: %w", err)
			}
		}
		return nil
	default:
		return fmt.Errorf("unsupported provider type %q", target.ProviderType)
	}
}

func (c *runtimeAdapterProviderClient) callCount(providerTypePath string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.calls[providerTypePath]
}

func runtimeAdapterContains(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(value, target) {
			return true
		}
	}
	return false
}

func runtimeAdapterAssignResponse(out interface{}, payload interface{}) error {
	if out == nil {
		return nil
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

type runtimeAdapterUpstreamCalls struct {
	observe int32
	actuate int32
	verify  int32
}

func newRuntimeAdapterUpstreamTransport(t *testing.T) (http.RoundTripper, *runtimeAdapterUpstreamCalls) {
	t.Helper()
	calls := &runtimeAdapterUpstreamCalls{}
	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/v1alpha1/desktop-provider/observe":
			atomic.AddInt32(&calls.observe, 1)
			var in DesktopObserveRequest
			if err := json.NewDecoder(io.LimitReader(req.Body, 2<<20)).Decode(&in); err != nil {
				return textHTTPResponse(http.StatusBadRequest, err.Error()), nil
			}
			return jsonHTTPResponse(http.StatusOK, DesktopObserveResponse{
				DesktopDecisionResponse: DesktopDecisionResponse{
					Decision:             "ALLOW",
					VerifierID:           "V-M13-LNX-001",
					ReasonCode:           "ok",
					ObservedCapabilities: append([]string(nil), in.Step.RequestedCapabilities...),
				},
				EvidenceBundle: evidenceBundleFor(in.Step, "observe", "observed"),
			}), nil
		case "/v1alpha1/desktop-provider/actuate":
			atomic.AddInt32(&calls.actuate, 1)
			var in DesktopActuateRequest
			if err := json.NewDecoder(io.LimitReader(req.Body, 2<<20)).Decode(&in); err != nil {
				return textHTTPResponse(http.StatusBadRequest, err.Error()), nil
			}
			bundle := evidenceBundleFor(in.Step, "actuate", "ok")
			return jsonHTTPResponse(http.StatusOK, DesktopActuateResponse{
				DesktopDecisionResponse: DesktopDecisionResponse{
					Decision:             "ALLOW",
					VerifierID:           "V-M13-LNX-002",
					ReasonCode:           "ok",
					ObservedCapabilities: append([]string(nil), in.Step.RequestedCapabilities...),
				},
				EvidenceBundle: &bundle,
			}), nil
		case "/v1alpha1/desktop-provider/verify":
			atomic.AddInt32(&calls.verify, 1)
			var in DesktopVerifyRequest
			if err := json.NewDecoder(io.LimitReader(req.Body, 2<<20)).Decode(&in); err != nil {
				return textHTTPResponse(http.StatusBadRequest, err.Error()), nil
			}
			return jsonHTTPResponse(http.StatusOK, DesktopVerifyResponse{
				DesktopDecisionResponse: DesktopDecisionResponse{
					Decision:             "ALLOW",
					VerifierID:           "V-M13-LNX-003",
					ReasonCode:           "ok",
					ObservedCapabilities: append([]string(nil), in.Step.RequestedCapabilities...),
				},
				EvidenceBundle: evidenceBundleFor(in.Step, "verify", "verified"),
			}), nil
		default:
			return textHTTPResponse(http.StatusNotFound, "not found"), nil
		}
	})
	return transport, calls
}

func TestRuntimeExecuteRunThroughOpenfangAdapterSandboxPath(t *testing.T) {
	upstreamTransport, upstreamCalls := newRuntimeAdapterUpstreamTransport(t)

	cfg := Config{
		TargetOS: "linux",
		Upstream: UpstreamConfig{
			Enabled: true,
			BaseURL: "https://openfang-provider.epydios.local",
		},
	}
	_, adapterHandler := newAdapterHandler(t, cfg, upstreamTransport)

	providerClient := newRuntimeAdapterProviderClient(adapterHandler)
	orch := &rt.Orchestrator{
		Namespace:            "epydios-system",
		Store:                newRuntimeAdapterRunStore(),
		ProviderRegistry:     providerClient,
		DesktopAllowNonLinux: false,
	}

	run, err := orch.ExecuteRun(context.Background(), runtimeAdapterRunRequest("sandbox_vm_autonomous", true))
	if err != nil {
		t.Fatalf("ExecuteRun() error = %v", err)
	}
	if run.Status != rt.RunStatusCompleted {
		t.Fatalf("run status = %s, want %s", run.Status, rt.RunStatusCompleted)
	}
	if run.SelectedDesktopProvider != "oss-desktop-openfang-linux" {
		t.Fatalf("selected desktop provider = %q, want %q", run.SelectedDesktopProvider, "oss-desktop-openfang-linux")
	}
	if providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/observe") != 1 {
		t.Fatalf("desktop observe call count = %d, want 1", providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/observe"))
	}
	if providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/actuate") != 1 {
		t.Fatalf("desktop actuate call count = %d, want 1", providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/actuate"))
	}
	if providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/verify") != 1 {
		t.Fatalf("desktop verify call count = %d, want 1", providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/verify"))
	}
	if atomic.LoadInt32(&upstreamCalls.observe) != 1 {
		t.Fatalf("upstream observe call count = %d, want 1", upstreamCalls.observe)
	}
	if atomic.LoadInt32(&upstreamCalls.actuate) != 1 {
		t.Fatalf("upstream actuate call count = %d, want 1", upstreamCalls.actuate)
	}
	if atomic.LoadInt32(&upstreamCalls.verify) != 1 {
		t.Fatalf("upstream verify call count = %d, want 1", upstreamCalls.verify)
	}
}

func TestRuntimeExecuteRunThroughOpenfangAdapterRestrictedHostDenied(t *testing.T) {
	upstreamTransport, upstreamCalls := newRuntimeAdapterUpstreamTransport(t)

	cfg := Config{
		TargetOS: "linux",
		Upstream: UpstreamConfig{
			Enabled: true,
			BaseURL: "https://openfang-provider.epydios.local",
		},
	}
	_, adapterHandler := newAdapterHandler(t, cfg, upstreamTransport)

	providerClient := newRuntimeAdapterProviderClient(adapterHandler)
	orch := &rt.Orchestrator{
		Namespace:            "epydios-system",
		Store:                newRuntimeAdapterRunStore(),
		ProviderRegistry:     providerClient,
		DesktopAllowNonLinux: false,
	}

	run, err := orch.ExecuteRun(context.Background(), runtimeAdapterRunRequest("restricted_host", true))
	if err == nil {
		t.Fatalf("expected restricted_host execution to fail")
	}
	if !strings.Contains(err.Error(), "restricted_host_blocked") {
		t.Fatalf("expected restricted_host_blocked error, got %v", err)
	}
	if run == nil {
		t.Fatalf("expected non-nil run on failure")
	}
	if run.Status != rt.RunStatusFailed {
		t.Fatalf("run status = %s, want %s", run.Status, rt.RunStatusFailed)
	}
	if providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/observe") != 1 {
		t.Fatalf("desktop observe call count = %d, want 1", providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/observe"))
	}
	if providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/actuate") != 0 {
		t.Fatalf("desktop actuate call count = %d, want 0", providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/actuate"))
	}
	if providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/verify") != 0 {
		t.Fatalf("desktop verify call count = %d, want 0", providerClient.callCount("DesktopProvider:/v1alpha1/desktop-provider/verify"))
	}
	if atomic.LoadInt32(&upstreamCalls.observe) != 0 {
		t.Fatalf("upstream observe call count = %d, want 0", upstreamCalls.observe)
	}
	if atomic.LoadInt32(&upstreamCalls.actuate) != 0 {
		t.Fatalf("upstream actuate call count = %d, want 0", upstreamCalls.actuate)
	}
	if atomic.LoadInt32(&upstreamCalls.verify) != 0 {
		t.Fatalf("upstream verify call count = %d, want 0", upstreamCalls.verify)
	}
}

func runtimeAdapterRunRequest(execProfile string, restrictedHostOptIn bool) rt.RunCreateRequest {
	return rt.RunCreateRequest{
		Meta: rt.ObjectMeta{
			RequestID:   "req-openfang-adapter-runtime",
			TenantID:    "tenant-a",
			ProjectID:   "project-a",
			Environment: "dev",
		},
		Subject: rt.JSONObject{
			"type": "user",
			"id":   "user-1",
		},
		Action: rt.JSONObject{
			"verb":   "desktop.step",
			"target": "openfang-sandbox",
		},
		Desktop: &rt.DesktopExecutionRequest{
			Enabled:                true,
			Tier:                   2,
			TargetOS:               "linux",
			TargetExecutionProfile: execProfile,
			RequestedCapabilities: []string{
				"observe.window_metadata",
				"actuate.window_focus",
				"verify.post_action_state",
			},
			RequiredVerifierIDs: []string{
				"V-M13-LNX-001",
				"V-M13-LNX-002",
				"V-M13-LNX-003",
			},
			Observer: rt.JSONObject{
				"mode": "snapshot",
			},
			Actuation: rt.JSONObject{
				"type":     "click",
				"selector": "#approve",
			},
			PostAction: rt.JSONObject{
				"verify": "post_action_state",
			},
			RestrictedHostOptIn: restrictedHostOptIn,
		},
	}
}
