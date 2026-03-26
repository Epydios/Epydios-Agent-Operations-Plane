package runtime

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"testing"
)

const openfangTestScreenshotHash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

type memoryRunStore struct {
	mu                  sync.RWMutex
	runs                map[string]*RunRecord
	integrationSettings map[string]*IntegrationSettingsRecord
	connectorSettings   map[string]*ConnectorSettingsRecord
	tasks               map[string]*TaskRecord
	sessions            map[string]*SessionRecord
	sessionWorkers      map[string]*SessionWorkerRecord
	toolActions         map[string]*ToolActionRecord
	sessionEvents       map[string][]SessionEventRecord
	approvalCheckpoints map[string]*ApprovalCheckpointRecord
	evidenceRecords     map[string]*EvidenceRecord
}

func newMemoryRunStore() *memoryRunStore {
	return &memoryRunStore{
		runs:                make(map[string]*RunRecord),
		integrationSettings: make(map[string]*IntegrationSettingsRecord),
		connectorSettings:   make(map[string]*ConnectorSettingsRecord),
		tasks:               make(map[string]*TaskRecord),
		sessions:            make(map[string]*SessionRecord),
		sessionWorkers:      make(map[string]*SessionWorkerRecord),
		toolActions:         make(map[string]*ToolActionRecord),
		sessionEvents:       make(map[string][]SessionEventRecord),
		approvalCheckpoints: make(map[string]*ApprovalCheckpointRecord),
		evidenceRecords:     make(map[string]*EvidenceRecord),
	}
}

func (s *memoryRunStore) Ping(context.Context) error { return nil }

func (s *memoryRunStore) EnsureSchema(context.Context) error { return nil }

func (s *memoryRunStore) UpsertRun(_ context.Context, run *RunRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.RunID] = cloneRunRecord(run)
	return nil
}

func (s *memoryRunStore) GetRun(_ context.Context, runID string) (*RunRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	run, ok := s.runs[runID]
	if !ok {
		return nil, fmt.Errorf("run %s not found", runID)
	}
	return cloneRunRecord(run), nil
}

func (s *memoryRunStore) ListRuns(_ context.Context, _ RunListQuery) ([]RunSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	items := make([]RunSummary, 0, len(s.runs))
	for _, run := range s.runs {
		items = append(items, RunSummary{
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

func (s *memoryRunStore) PruneRuns(_ context.Context, query RunPruneQuery) (*RunPruneResult, error) {
	return &RunPruneResult{
		DryRun:         query.DryRun,
		Before:         query.Before,
		RetentionClass: query.RetentionClass,
		Limit:          query.Limit,
	}, nil
}

func (s *memoryRunStore) UpsertIntegrationSettings(_ context.Context, record *IntegrationSettingsRecord) error {
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
	key := integrationSettingsKey(tenantID, projectID)
	s.integrationSettings[key] = cloneIntegrationSettingsRecord(record)
	return nil
}

func (s *memoryRunStore) GetIntegrationSettings(_ context.Context, tenantID, projectID string) (*IntegrationSettingsRecord, error) {
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
	key := integrationSettingsKey(tenantID, projectID)
	record, ok := s.integrationSettings[key]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneIntegrationSettingsRecord(record), nil
}

func (s *memoryRunStore) UpsertConnectorSettings(_ context.Context, record *ConnectorSettingsRecord) error {
	if record == nil {
		return fmt.Errorf("connector settings record is required")
	}
	tenantID := strings.TrimSpace(record.TenantID)
	projectID := strings.TrimSpace(record.ProjectID)
	if tenantID == "" {
		return fmt.Errorf("connector settings tenantId is required")
	}
	if projectID == "" {
		return fmt.Errorf("connector settings projectId is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	key := integrationSettingsKey(tenantID, projectID)
	s.connectorSettings[key] = cloneConnectorSettingsRecord(record)
	return nil
}

func (s *memoryRunStore) GetConnectorSettings(_ context.Context, tenantID, projectID string) (*ConnectorSettingsRecord, error) {
	tenantID = strings.TrimSpace(tenantID)
	projectID = strings.TrimSpace(projectID)
	if tenantID == "" {
		return nil, fmt.Errorf("connector settings tenantId is required")
	}
	if projectID == "" {
		return nil, fmt.Errorf("connector settings projectId is required")
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	key := integrationSettingsKey(tenantID, projectID)
	record, ok := s.connectorSettings[key]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneConnectorSettingsRecord(record), nil
}

func (s *memoryRunStore) UpsertTask(_ context.Context, record *TaskRecord) error {
	if record == nil {
		return fmt.Errorf("task record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tasks[record.TaskID] = cloneTaskRecord(record)
	return nil
}

func (s *memoryRunStore) GetTask(_ context.Context, taskID string) (*TaskRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.tasks[strings.TrimSpace(taskID)]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneTaskRecord(record), nil
}

func (s *memoryRunStore) ListTasks(_ context.Context, query TaskListQuery) ([]TaskRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]TaskRecord, 0, len(s.tasks))
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
		items = append(items, *cloneTaskRecord(record))
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items, nil
}

func (s *memoryRunStore) UpsertSession(_ context.Context, record *SessionRecord) error {
	if record == nil {
		return fmt.Errorf("session record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[record.SessionID] = cloneSessionRecord(record)
	return nil
}

func (s *memoryRunStore) GetSession(_ context.Context, sessionID string) (*SessionRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.sessions[strings.TrimSpace(sessionID)]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneSessionRecord(record), nil
}

func (s *memoryRunStore) ListSessions(_ context.Context, query SessionListQuery) ([]SessionRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]SessionRecord, 0, len(s.sessions))
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
		items = append(items, *cloneSessionRecord(record))
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items, nil
}

func (s *memoryRunStore) UpsertSessionWorker(_ context.Context, record *SessionWorkerRecord) error {
	if record == nil {
		return fmt.Errorf("session worker record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessionWorkers[record.WorkerID] = cloneSessionWorkerRecord(record)
	return nil
}

func (s *memoryRunStore) ListSessionWorkers(_ context.Context, query SessionWorkerListQuery) ([]SessionWorkerRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]SessionWorkerRecord, 0, len(s.sessionWorkers))
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
		items = append(items, *cloneSessionWorkerRecord(record))
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func (s *memoryRunStore) UpsertToolAction(_ context.Context, record *ToolActionRecord) error {
	if record == nil {
		return fmt.Errorf("tool action record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.toolActions[record.ToolActionID] = cloneToolActionRecord(record)
	return nil
}

func (s *memoryRunStore) ListToolActions(_ context.Context, query ToolActionListQuery) ([]ToolActionRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]ToolActionRecord, 0, len(s.toolActions))
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
		items = append(items, *cloneToolActionRecord(record))
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func (s *memoryRunStore) AppendSessionEvent(_ context.Context, record *SessionEventRecord) error {
	if record == nil {
		return fmt.Errorf("session event record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	event := cloneSessionEventRecord(record)
	if event.Sequence <= 0 {
		event.Sequence = int64(len(s.sessionEvents[event.SessionID]) + 1)
	}
	if strings.TrimSpace(event.EventID) == "" {
		event.EventID = fmt.Sprintf("%s-event-%d", event.SessionID, event.Sequence)
	}
	s.sessionEvents[event.SessionID] = append(s.sessionEvents[event.SessionID], *event)
	return nil
}

func (s *memoryRunStore) ListSessionEvents(_ context.Context, query SessionEventListQuery) ([]SessionEventRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]SessionEventRecord, 0, len(s.sessionEvents[query.SessionID]))
	for _, record := range s.sessionEvents[query.SessionID] {
		if query.AfterSequence > 0 && record.Sequence <= query.AfterSequence {
			continue
		}
		items = append(items, *cloneSessionEventRecord(&record))
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Sequence < items[j].Sequence
	})
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func (s *memoryRunStore) UpsertApprovalCheckpoint(_ context.Context, record *ApprovalCheckpointRecord) error {
	if record == nil {
		return fmt.Errorf("approval checkpoint record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.approvalCheckpoints[record.CheckpointID] = cloneApprovalCheckpointRecord(record)
	return nil
}

func (s *memoryRunStore) ListApprovalCheckpoints(_ context.Context, query ApprovalCheckpointListQuery) ([]ApprovalCheckpointRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]ApprovalCheckpointRecord, 0, len(s.approvalCheckpoints))
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
		items = append(items, *cloneApprovalCheckpointRecord(record))
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func (s *memoryRunStore) UpsertEvidenceRecord(_ context.Context, record *EvidenceRecord) error {
	if record == nil {
		return fmt.Errorf("evidence record is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.evidenceRecords[record.EvidenceID] = cloneEvidenceRecord(record)
	return nil
}

func (s *memoryRunStore) ListEvidenceRecords(_ context.Context, query EvidenceRecordListQuery) ([]EvidenceRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]EvidenceRecord, 0, len(s.evidenceRecords))
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
		items = append(items, *cloneEvidenceRecord(record))
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func integrationSettingsKey(tenantID, projectID string) string {
	return strings.TrimSpace(tenantID) + "::" + strings.TrimSpace(projectID)
}

func cloneRunRecord(in *RunRecord) *RunRecord {
	if in == nil {
		return nil
	}
	out := *in
	if in.ExpiresAt != nil {
		t := *in.ExpiresAt
		out.ExpiresAt = &t
	}
	out.RequestPayload = cloneBytes(in.RequestPayload)
	out.ProfileResponse = cloneBytes(in.ProfileResponse)
	out.PolicyResponse = cloneBytes(in.PolicyResponse)
	out.DesktopObserveResponse = cloneBytes(in.DesktopObserveResponse)
	out.DesktopActuateResponse = cloneBytes(in.DesktopActuateResponse)
	out.DesktopVerifyResponse = cloneBytes(in.DesktopVerifyResponse)
	out.EvidenceRecordResponse = cloneBytes(in.EvidenceRecordResponse)
	out.EvidenceBundleResponse = cloneBytes(in.EvidenceBundleResponse)
	return &out
}

func cloneIntegrationSettingsRecord(in *IntegrationSettingsRecord) *IntegrationSettingsRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.Settings = cloneBytes(in.Settings)
	return &out
}

func cloneConnectorSettingsRecord(in *ConnectorSettingsRecord) *ConnectorSettingsRecord {
	if in == nil {
		return nil
	}
	out := *in
	if len(in.Settings) > 0 {
		out.Settings = append([]byte(nil), in.Settings...)
	}
	return &out
}

func cloneTaskRecord(in *TaskRecord) *TaskRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.RequestedBy = cloneBytes(in.RequestedBy)
	out.Annotations = cloneBytes(in.Annotations)
	return &out
}

func cloneSessionRecord(in *SessionRecord) *SessionRecord {
	if in == nil {
		return nil
	}
	out := *in
	if in.CompletedAt != nil {
		t := *in.CompletedAt
		out.CompletedAt = &t
	}
	out.Summary = cloneBytes(in.Summary)
	out.Annotations = cloneBytes(in.Annotations)
	return &out
}

func cloneSessionWorkerRecord(in *SessionWorkerRecord) *SessionWorkerRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.Capabilities = append([]string(nil), in.Capabilities...)
	out.Annotations = cloneBytes(in.Annotations)
	return &out
}

func cloneSessionEventRecord(in *SessionEventRecord) *SessionEventRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.Payload = cloneBytes(in.Payload)
	return &out
}

func cloneApprovalCheckpointRecord(in *ApprovalCheckpointRecord) *ApprovalCheckpointRecord {
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

func cloneToolActionRecord(in *ToolActionRecord) *ToolActionRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.RequestPayload = cloneBytes(in.RequestPayload)
	out.ResultPayload = cloneBytes(in.ResultPayload)
	out.AuditLink = cloneBytes(in.AuditLink)
	return &out
}

func cloneEvidenceRecord(in *EvidenceRecord) *EvidenceRecord {
	if in == nil {
		return nil
	}
	out := *in
	out.Metadata = cloneBytes(in.Metadata)
	return &out
}

func cloneBytes(in []byte) []byte {
	if in == nil {
		return nil
	}
	out := make([]byte, len(in))
	copy(out, in)
	return out
}

type fakeOpenfangProviderClient struct {
	mu        sync.Mutex
	providers map[string][]*ProviderTarget
	caps      map[string][]string
	calls     map[string]int
}

func newFakeOpenfangProviderClient() *fakeOpenfangProviderClient {
	providers := map[string][]*ProviderTarget{
		"ProfileResolver": {
			{
				Name:         "oss-profile-static",
				Namespace:    "epydios-system",
				ProviderType: "ProfileResolver",
				ProviderID:   "oss-profile-static",
				Priority:     100,
				AuthMode:     "None",
			},
		},
		"PolicyProvider": {
			{
				Name:         "oss-policy-openfang",
				Namespace:    "epydios-system",
				ProviderType: "PolicyProvider",
				ProviderID:   "oss-policy-openfang",
				Priority:     100,
				AuthMode:     "None",
			},
		},
		"EvidenceProvider": {
			{
				Name:         "oss-evidence-memory",
				Namespace:    "epydios-system",
				ProviderType: "EvidenceProvider",
				ProviderID:   "oss-evidence-memory",
				Priority:     100,
				AuthMode:     "None",
			},
		},
		"DesktopProvider": {
			{
				Name:         "oss-desktop-openfang-linux",
				Namespace:    "epydios-system",
				ProviderType: "DesktopProvider",
				ProviderID:   "oss-desktop-openfang-linux",
				Priority:     80,
				TargetOS:     desktopOSLinux,
				AuthMode:     "None",
			},
			{
				Name:         "oss-desktop-openfang-windows",
				Namespace:    "epydios-system",
				ProviderType: "DesktopProvider",
				ProviderID:   "oss-desktop-openfang-windows",
				Priority:     75,
				TargetOS:     desktopOSWindows,
				AuthMode:     "None",
			},
			{
				Name:         "oss-desktop-openfang-macos",
				Namespace:    "epydios-system",
				ProviderType: "DesktopProvider",
				ProviderID:   "oss-desktop-openfang-macos",
				Priority:     75,
				TargetOS:     desktopOSMacOS,
				AuthMode:     "None",
			},
		},
	}

	return &fakeOpenfangProviderClient{
		providers: providers,
		caps: map[string][]string{
			"oss-profile-static":           {"profile.resolve"},
			"oss-policy-openfang":          {"policy.evaluate"},
			"oss-evidence-memory":          {"evidence.record"},
			"oss-desktop-openfang-linux":   {"observe.window_metadata", "observe.screenshot_hash", "actuate.window_focus", "actuate.input.type_click", "verify.post_action_state"},
			"oss-desktop-openfang-windows": {"observe.window_metadata", "observe.screenshot_hash", "actuate.window_focus", "actuate.input.type_click", "verify.post_action_state"},
			"oss-desktop-openfang-macos":   {"observe.window_metadata", "observe.screenshot_hash", "actuate.window_focus", "actuate.input.type_click", "verify.post_action_state"},
		},
		calls: map[string]int{},
	}
}

func (c *fakeOpenfangProviderClient) SelectProvider(_ context.Context, _ string, providerType, requiredCapability, targetOS string, minPriority int64) (*ProviderTarget, error) {
	providers, ok := c.providers[providerType]
	if !ok || len(providers) == 0 {
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}

	normalizedTargetOS := normalizeProviderTargetOS(targetOS)
	var selected *ProviderTarget
	for _, provider := range providers {
		if provider.Priority < minPriority {
			continue
		}
		if requiredCapability != "" && !containsString(c.caps[provider.Name], requiredCapability) {
			continue
		}
		if providerType == "DesktopProvider" && normalizedTargetOS != "" && !providerTargetOSMatches(provider.TargetOS, normalizedTargetOS) {
			continue
		}
		if selected == nil || provider.Priority > selected.Priority || (provider.Priority == selected.Priority && provider.Name < selected.Name) {
			selected = provider
		}
	}
	if selected == nil {
		if providerType == "DesktopProvider" && normalizedTargetOS != "" {
			return nil, fmt.Errorf("no provider found (type=%s capability=%s targetOS=%s minPriority=%d)", providerType, requiredCapability, normalizedTargetOS, minPriority)
		}
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}
	copyProvider := *selected
	return &copyProvider, nil
}

func (c *fakeOpenfangProviderClient) PostJSON(_ context.Context, target *ProviderTarget, path string, reqBody interface{}, out interface{}) error {
	c.mu.Lock()
	c.calls[path]++
	c.mu.Unlock()

	switch target.ProviderType {
	case "ProfileResolver":
		if path != "/v1alpha1/profile-resolver/resolve" {
			return fmt.Errorf("unexpected profile path %q", path)
		}
		return assignResponse(out, map[string]interface{}{
			"profileId":      "desktop-sandbox-linux",
			"profileVersion": "v1",
			"source":         "openfang-fixture",
		})
	case "PolicyProvider":
		if path != "/v1alpha1/policy-provider/evaluate" {
			return fmt.Errorf("unexpected policy path %q", path)
		}
		return assignResponse(out, map[string]interface{}{
			"decision": "ALLOW",
			"policyBundle": map[string]interface{}{
				"policyId":      "EPYDIOS_OSS_POLICY_BASELINE",
				"policyVersion": "v1",
			},
			"grantToken": "grant-openfang-integration",
		})
	case "EvidenceProvider":
		switch path {
		case "/v1alpha1/evidence-provider/record":
			return assignResponse(out, map[string]interface{}{
				"accepted":   true,
				"evidenceId": "evidence-openfang-1",
				"checksum":   openfangTestScreenshotHash,
				"storageUri": "memory://openfang/evidence-openfang-1",
			})
		case "/v1alpha1/evidence-provider/finalize-bundle":
			return assignResponse(out, map[string]interface{}{
				"bundleId":         "bundle-openfang-1",
				"manifestUri":      "memory://openfang/bundle-openfang-1",
				"manifestChecksum": openfangTestScreenshotHash,
				"itemCount":        1,
			})
		default:
			return fmt.Errorf("unexpected evidence path %q", path)
		}
	case "DesktopProvider":
		switch path {
		case "/v1alpha1/desktop-provider/observe":
			var req DesktopObserveRequest
			if err := decodeRequestBody(reqBody, &req); err != nil {
				return err
			}
			if strings.EqualFold(strings.TrimSpace(req.Step.TargetExecutionProfile), "restricted_host") {
				return assignResponse(out, DesktopObserveResponse{
					DesktopDecisionResponse: DesktopDecisionResponse{
						Decision:      "DENY",
						VerifierID:    "V-M13-LNX-002",
						ReasonCode:    "restricted_host_blocked",
						ReasonMessage: "restricted_host is blocked by openfang adapter policy",
					},
					EvidenceBundle: desktopEvidence("observe", req.Step.TargetExecutionProfile, "denied"),
				})
			}
			return assignResponse(out, DesktopObserveResponse{
				DesktopDecisionResponse: DesktopDecisionResponse{
					Decision:             "ALLOW",
					VerifierID:           "V-M13-LNX-001",
					ReasonCode:           "ok",
					ObservedCapabilities: append([]string(nil), req.Step.RequestedCapabilities...),
				},
				EvidenceBundle: desktopEvidence("observe", req.Step.TargetExecutionProfile, "observed"),
			})
		case "/v1alpha1/desktop-provider/actuate":
			var req DesktopActuateRequest
			if err := decodeRequestBody(reqBody, &req); err != nil {
				return err
			}
			if len(req.Action) == 0 {
				bundle := desktopEvidence("actuate", req.Step.TargetExecutionProfile, "no_action")
				return assignResponse(out, DesktopActuateResponse{
					DesktopDecisionResponse: DesktopDecisionResponse{
						Decision:      "DENY",
						VerifierID:    "V-M13-LNX-002",
						ReasonCode:    "no_action",
						ReasonMessage: "action payload is required",
					},
					EvidenceBundle: &bundle,
				})
			}
			bundle := desktopEvidence("actuate", req.Step.TargetExecutionProfile, "ok")
			return assignResponse(out, DesktopActuateResponse{
				DesktopDecisionResponse: DesktopDecisionResponse{
					Decision:             "ALLOW",
					VerifierID:           "V-M13-LNX-002",
					ReasonCode:           "ok",
					ObservedCapabilities: append([]string(nil), req.Step.RequestedCapabilities...),
				},
				EvidenceBundle: &bundle,
			})
		case "/v1alpha1/desktop-provider/verify":
			var req DesktopVerifyRequest
			if err := decodeRequestBody(reqBody, &req); err != nil {
				return err
			}
			return assignResponse(out, DesktopVerifyResponse{
				DesktopDecisionResponse: DesktopDecisionResponse{
					Decision:             "ALLOW",
					VerifierID:           "V-M13-LNX-003",
					ReasonCode:           "ok",
					ObservedCapabilities: append([]string(nil), req.Step.RequestedCapabilities...),
				},
				EvidenceBundle: desktopEvidence("verify", req.Step.TargetExecutionProfile, "verified"),
			})
		default:
			return fmt.Errorf("unexpected desktop path %q", path)
		}
	default:
		return fmt.Errorf("unsupported provider type %q", target.ProviderType)
	}
}

func (c *fakeOpenfangProviderClient) callCount(path string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.calls[path]
}

func assignResponse(out interface{}, payload interface{}) error {
	if out == nil {
		return nil
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(b, out); err != nil {
		return err
	}
	return nil
}

func decodeRequestBody(in interface{}, out interface{}) error {
	b, err := json.Marshal(in)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(b, out); err != nil {
		return err
	}
	return nil
}

func desktopEvidence(operation, profile, resultCode string) DesktopEvidenceBundle {
	return DesktopEvidenceBundle{
		WindowMetadata: JSONObject{
			"operation": operation,
			"profile":   profile,
		},
		ScreenshotHash: openfangTestScreenshotHash,
		ResultCode:     resultCode,
	}
}

func TestExecuteRunOpenfangSandboxPath(t *testing.T) {
	providerClient := newFakeOpenfangProviderClient()
	orch := &Orchestrator{
		Namespace:            "epydios-system",
		Store:                newMemoryRunStore(),
		ProviderRegistry:     providerClient,
		DesktopAllowNonLinux: false,
	}

	run, err := orch.ExecuteRun(context.Background(), newOpenfangRunRequest("linux", "sandbox_vm_autonomous", true))
	if err != nil {
		t.Fatalf("ExecuteRun() error = %v", err)
	}
	if run.Status != RunStatusCompleted {
		t.Fatalf("run status = %s, want %s", run.Status, RunStatusCompleted)
	}
	if run.SelectedDesktopProvider != "oss-desktop-openfang-linux" {
		t.Fatalf("selected desktop provider = %q, want %q", run.SelectedDesktopProvider, "oss-desktop-openfang-linux")
	}
	if len(run.DesktopObserveResponse) == 0 || len(run.DesktopActuateResponse) == 0 || len(run.DesktopVerifyResponse) == 0 {
		t.Fatalf("desktop responses should be populated after observe->actuate->verify")
	}
	if providerClient.callCount("/v1alpha1/desktop-provider/observe") != 1 {
		t.Fatalf("observe call count = %d, want 1", providerClient.callCount("/v1alpha1/desktop-provider/observe"))
	}
	if providerClient.callCount("/v1alpha1/desktop-provider/actuate") != 1 {
		t.Fatalf("actuate call count = %d, want 1", providerClient.callCount("/v1alpha1/desktop-provider/actuate"))
	}
	if providerClient.callCount("/v1alpha1/desktop-provider/verify") != 1 {
		t.Fatalf("verify call count = %d, want 1", providerClient.callCount("/v1alpha1/desktop-provider/verify"))
	}
}

func TestExecuteRunOpenfangRestrictedHostDenied(t *testing.T) {
	providerClient := newFakeOpenfangProviderClient()
	orch := &Orchestrator{
		Namespace:            "epydios-system",
		Store:                newMemoryRunStore(),
		ProviderRegistry:     providerClient,
		DesktopAllowNonLinux: false,
	}

	run, err := orch.ExecuteRun(context.Background(), newOpenfangRunRequest("linux", "restricted_host", true))
	if err == nil {
		t.Fatalf("expected restricted_host execution to fail")
	}
	if !strings.Contains(err.Error(), "restricted_host_blocked") {
		t.Fatalf("expected restricted_host_blocked error, got %v", err)
	}
	if run == nil {
		t.Fatalf("expected non-nil run on failure")
	}
	if run.Status != RunStatusFailed {
		t.Fatalf("run status = %s, want %s", run.Status, RunStatusFailed)
	}
	if run.SelectedDesktopProvider != "oss-desktop-openfang-linux" {
		t.Fatalf("selected desktop provider = %q, want %q", run.SelectedDesktopProvider, "oss-desktop-openfang-linux")
	}
	if providerClient.callCount("/v1alpha1/desktop-provider/observe") != 1 {
		t.Fatalf("observe call count = %d, want 1", providerClient.callCount("/v1alpha1/desktop-provider/observe"))
	}
	if providerClient.callCount("/v1alpha1/desktop-provider/actuate") != 0 {
		t.Fatalf("actuate call count = %d, want 0", providerClient.callCount("/v1alpha1/desktop-provider/actuate"))
	}
	if providerClient.callCount("/v1alpha1/desktop-provider/verify") != 0 {
		t.Fatalf("verify call count = %d, want 0", providerClient.callCount("/v1alpha1/desktop-provider/verify"))
	}
}

func TestExecuteRunOpenfangWindowsTargetSelectsWindowsProvider(t *testing.T) {
	providerClient := newFakeOpenfangProviderClient()
	orch := &Orchestrator{
		Namespace:            "epydios-system",
		Store:                newMemoryRunStore(),
		ProviderRegistry:     providerClient,
		DesktopAllowNonLinux: true,
	}

	run, err := orch.ExecuteRun(context.Background(), newOpenfangRunRequest("windows", "sandbox_vm_autonomous", true))
	if err != nil {
		t.Fatalf("ExecuteRun() error = %v", err)
	}
	if run.Status != RunStatusCompleted {
		t.Fatalf("run status = %s, want %s", run.Status, RunStatusCompleted)
	}
	if run.SelectedDesktopProvider != "oss-desktop-openfang-windows" {
		t.Fatalf("selected desktop provider = %q, want %q", run.SelectedDesktopProvider, "oss-desktop-openfang-windows")
	}
}

func TestExecuteRunOpenfangMacOSTargetSelectsMacOSProvider(t *testing.T) {
	providerClient := newFakeOpenfangProviderClient()
	orch := &Orchestrator{
		Namespace:            "epydios-system",
		Store:                newMemoryRunStore(),
		ProviderRegistry:     providerClient,
		DesktopAllowNonLinux: true,
	}

	run, err := orch.ExecuteRun(context.Background(), newOpenfangRunRequest("macos", "sandbox_vm_autonomous", true))
	if err != nil {
		t.Fatalf("ExecuteRun() error = %v", err)
	}
	if run.Status != RunStatusCompleted {
		t.Fatalf("run status = %s, want %s", run.Status, RunStatusCompleted)
	}
	if run.SelectedDesktopProvider != "oss-desktop-openfang-macos" {
		t.Fatalf("selected desktop provider = %q, want %q", run.SelectedDesktopProvider, "oss-desktop-openfang-macos")
	}
}

func newOpenfangRunRequest(targetOS, execProfile string, restrictedHostOptIn bool) RunCreateRequest {
	normalizedTargetOS := normalizeProviderTargetOS(targetOS)
	if normalizedTargetOS == "" {
		normalizedTargetOS = desktopOSLinux
	}
	return RunCreateRequest{
		Meta: ObjectMeta{
			RequestID:   "req-openfang-integration",
			TenantID:    "tenant-a",
			ProjectID:   "project-a",
			Environment: "dev",
		},
		Subject: JSONObject{
			"type": "user",
			"id":   "user-1",
		},
		Action: JSONObject{
			"verb":   "desktop.step",
			"target": "openfang-sandbox",
		},
		Desktop: &DesktopExecutionRequest{
			Enabled:                true,
			Tier:                   2,
			TargetOS:               normalizedTargetOS,
			TargetExecutionProfile: execProfile,
			RequestedCapabilities: []string{
				"observe.window_metadata",
				"actuate.window_focus",
				"verify.post_action_state",
			},
			RequiredVerifierIDs: defaultDesktopVerifierIDs(normalizedTargetOS),
			Observer: JSONObject{
				"mode": "snapshot",
			},
			Actuation: JSONObject{
				"type":     "click",
				"selector": "#approve",
			},
			PostAction: JSONObject{
				"verify": "post_action_state",
			},
			RestrictedHostOptIn: restrictedHostOptIn,
		},
	}
}
