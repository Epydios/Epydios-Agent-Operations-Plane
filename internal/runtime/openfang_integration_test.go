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
}

func newMemoryRunStore() *memoryRunStore {
	return &memoryRunStore{
		runs:                make(map[string]*RunRecord),
		integrationSettings: make(map[string]*IntegrationSettingsRecord),
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
