package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	runtimeclient "github.com/Epydios/Epydios-AgentOps-Control-Plane/clients/internal/runtimeclient"
	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type cliParityFixture struct {
	Task struct {
		TaskID string `json:"taskId"`
		Title  string `json:"title"`
		Status string `json:"status"`
	} `json:"task"`
	Session struct {
		SessionID        string `json:"sessionId"`
		TaskID           string `json:"taskId"`
		Status           string `json:"status"`
		SelectedWorkerID string `json:"selectedWorkerId"`
	} `json:"session"`
	SelectedWorker struct {
		WorkerID   string `json:"workerId"`
		WorkerType string `json:"workerType"`
		AdapterID  string `json:"adapterId"`
		Status     string `json:"status"`
	} `json:"selectedWorker"`
	PendingApprovals []struct {
		CheckpointID string `json:"checkpointId"`
		Scope        string `json:"scope"`
		Status       string `json:"status"`
	} `json:"pendingApprovals"`
	Events []struct {
		EventID   string                 `json:"eventId"`
		Sequence  int64                  `json:"sequence"`
		EventType string                 `json:"eventType"`
		Payload   map[string]interface{} `json:"payload"`
	} `json:"events"`
	EvidenceRecords []struct {
		EvidenceID string `json:"evidenceId"`
		Kind       string `json:"kind"`
		Summary    string `json:"summary"`
	} `json:"evidenceRecords"`
	Expected struct {
		Summary    string   `json:"summary"`
		EventLines []string `json:"eventLines"`
	} `json:"expected"`
}

func loadCLIParityFixture(t *testing.T) cliParityFixture {
	t.Helper()
	payload, err := os.ReadFile(filepath.Join("..", "testdata", "m19-cross-surface-parity.json"))
	if err != nil {
		t.Fatalf("read parity fixture: %v", err)
	}
	var fixture cliParityFixture
	if err := json.Unmarshal(payload, &fixture); err != nil {
		t.Fatalf("unmarshal parity fixture: %v", err)
	}
	return fixture
}

func buildCLIParityThreadReview(t *testing.T) *runtimeclient.ThreadReview {
	t.Helper()
	fixture := loadCLIParityFixture(t)
	task := &runtimeapi.TaskRecord{
		TaskID: fixture.Task.TaskID,
		Title:  fixture.Task.Title,
		Status: runtimeapi.TaskStatus(fixture.Task.Status),
	}
	timeline := &runtimeapi.SessionTimelineResponse{
		Session: runtimeapi.SessionRecord{
			SessionID:        fixture.Session.SessionID,
			TaskID:           fixture.Session.TaskID,
			Status:           runtimeapi.SessionStatus(fixture.Session.Status),
			SelectedWorkerID: fixture.Session.SelectedWorkerID,
		},
		Task: task,
		SelectedWorker: &runtimeapi.SessionWorkerRecord{
			WorkerID:   fixture.SelectedWorker.WorkerID,
			WorkerType: fixture.SelectedWorker.WorkerType,
			AdapterID:  fixture.SelectedWorker.AdapterID,
			Status:     runtimeapi.WorkerStatus(fixture.SelectedWorker.Status),
		},
		OpenApprovalCount: len(fixture.PendingApprovals),
	}
	for idx, item := range fixture.Events {
		payload, _ := json.Marshal(item.Payload)
		timeline.Events = append(timeline.Events, runtimeapi.SessionEventRecord{
			EventID:   item.EventID,
			SessionID: fixture.Session.SessionID,
			Sequence:  item.Sequence,
			EventType: runtimeapi.SessionEventType(item.EventType),
			Payload:   payload,
			Timestamp: time.Unix(int64(idx+1), 0).UTC(),
		})
	}
	for _, item := range fixture.PendingApprovals {
		timeline.ApprovalCheckpoints = append(timeline.ApprovalCheckpoints, runtimeapi.ApprovalCheckpointRecord{
			CheckpointID: item.CheckpointID,
			Scope:        item.Scope,
			Status:       runtimeapi.ApprovalStatus(item.Status),
		})
	}
	for _, item := range fixture.EvidenceRecords {
		timeline.EvidenceRecords = append(timeline.EvidenceRecords, runtimeapi.EvidenceRecord{
			EvidenceID: item.EvidenceID,
			SessionID:  fixture.Session.SessionID,
			Kind:       item.Kind,
			URI:        "memory://" + item.EvidenceID,
		})
	}
	return runtimeclient.BuildThreadReview(task, []runtimeapi.SessionRecord{timeline.Session}, timeline.Session.SessionID, timeline)
}

func TestNormalizedTaskIDFromTimeline(t *testing.T) {
	timeline := &runtimeapi.SessionTimelineResponse{
		Task: &runtimeapi.TaskRecord{TaskID: "task-1"},
		Session: runtimeapi.SessionRecord{
			SessionID: "sess-1",
			TaskID:    "fallback-task",
		},
	}
	if got := normalizedTaskIDFromTimeline(timeline); got != "task-1" {
		t.Fatalf("normalizedTaskIDFromTimeline()=%q want task-1", got)
	}
}

func TestPendingApprovalItemsAndProposalItems(t *testing.T) {
	timeline := &runtimeapi.SessionTimelineResponse{
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "appr-1", Status: runtimeapi.ApprovalStatusPending},
			{CheckpointID: "appr-2", Status: runtimeapi.ApprovalStatusApproved},
		},
		Events: []runtimeapi.SessionEventRecord{{
			EventID:   "evt-1",
			SessionID: "sess-1",
			Sequence:  1,
			EventType: "tool_proposal.generated",
			Payload:   json.RawMessage(`{"proposalId":"prop-1","summary":"Run pwd","payload":{"command":"pwd"}}`),
			Timestamp: time.Unix(10, 0).UTC(),
		}},
	}
	approvals := pendingApprovalItems(timeline)
	if len(approvals) != 1 || approvals[0].ID != "appr-1" {
		t.Fatalf("pendingApprovalItems()=%v", approvals)
	}
	proposals := pendingProposalItems(timeline)
	if len(proposals) != 1 || proposals[0].ID != "prop-1" {
		t.Fatalf("pendingProposalItems()=%v", proposals)
	}
}

func TestRenderCLIActionHintsIncludesDecisionCommands(t *testing.T) {
	view := &runtimeclient.ThreadReview{
		Task: runtimeapi.TaskRecord{TaskID: "task-1"},
		Timeline: &runtimeapi.SessionTimelineResponse{
			Session: runtimeapi.SessionRecord{SessionID: "sess-1"},
			ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{{
				CheckpointID: "appr-1",
				Status:       runtimeapi.ApprovalStatusPending,
			}},
			Events: []runtimeapi.SessionEventRecord{{
				EventID:   "evt-1",
				SessionID: "sess-1",
				Sequence:  1,
				EventType: "tool_proposal.generated",
				Payload:   json.RawMessage(`{"proposalId":"prop-1","summary":"Run pwd","payload":{"command":"pwd"}}`),
				Timestamp: time.Unix(10, 0).UTC(),
			}},
		},
	}
	hints := strings.Join(renderCLIActionHints(view), "\n")
	if !strings.Contains(hints, "approvals decide --session-id sess-1 --decision APPROVE|DENY") {
		t.Fatalf("expected approval hint, got %q", hints)
	}
	if !strings.Contains(hints, "proposals decide --session-id sess-1 --decision APPROVE|DENY") {
		t.Fatalf("expected proposal hint, got %q", hints)
	}
}

func TestRenderCLIThreadEnvelopeIncludesGovernedSections(t *testing.T) {
	view := &runtimeclient.ThreadReview{
		Task: runtimeapi.TaskRecord{TaskID: "task-1", Title: "Thread one", Status: "IN_PROGRESS"},
		Timeline: &runtimeapi.SessionTimelineResponse{
			Session: runtimeapi.SessionRecord{SessionID: "sess-1", Status: "RUNNING"},
			Task:    &runtimeapi.TaskRecord{TaskID: "task-1", Title: "Thread one", Status: "IN_PROGRESS"},
			SelectedWorker: &runtimeapi.SessionWorkerRecord{
				WorkerID:   "worker-1",
				WorkerType: "managed_agent",
				AdapterID:  "codex",
				Status:     "RUNNING",
			},
			ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{{
				CheckpointID: "appr-1",
				Status:       runtimeapi.ApprovalStatusPending,
			}},
			Events: []runtimeapi.SessionEventRecord{{
				EventID:   "evt-1",
				SessionID: "sess-1",
				Sequence:  1,
				EventType: "worker.progress",
				Payload:   json.RawMessage(`{"summary":"Worker running"}`),
				Timestamp: time.Unix(10, 0).UTC(),
			}},
		},
		RecentEvents: []runtimeclient.EventSummary{{
			EventID:   "evt-1",
			Sequence:  1,
			Timestamp: time.Unix(10, 0).UTC().Format(time.RFC3339),
			EventType: "worker.progress",
			Label:     "Worker Progress",
			Detail:    "Worker running",
		}},
	}
	rendered := renderCLIThreadEnvelope(view)
	if !strings.Contains(rendered, "AgentOps thread update") {
		t.Fatalf("expected governed header, got %q", rendered)
	}
	if !strings.Contains(rendered, "Type: review") {
		t.Fatalf("expected review type, got %q", rendered)
	}
	if !strings.Contains(rendered, "Action hints:") {
		t.Fatalf("expected action hints section, got %q", rendered)
	}
}

func TestRenderCLIThreadEnvelopeMatchesParityFixture(t *testing.T) {
	fixture := loadCLIParityFixture(t)
	view := buildCLIParityThreadReview(t)
	rendered := renderCLIThreadEnvelope(view)
	for _, part := range append(fixture.Expected.EventLines, "Action hints:", "--checkpoint-id <id>", fixture.Expected.Summary) {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in %s", part, rendered)
		}
	}
}

func TestRenderCLIReportIncludesGovernedSectionsAndRedactsSecrets(t *testing.T) {
	client := newCLIReportTestClient(t)
	view := buildCLIParityThreadReview(t)
	view.Transcript = &runtimeclient.ManagedTranscript{
		ToolActionID: "tool-act-1",
		Pretty:       "token sk-1234567890abcdefghijklmnop and Bearer abcdefghijklmnopqrstuvwxyz012345",
	}
	rendered, err := renderCLIReport(context.Background(), client, view, runtimeclient.EnterpriseReportSelection{})
	if err != nil {
		t.Fatalf("renderCLIReport() error = %v", err)
	}
	for _, part := range []string{
		"AgentOps CLI governance report",
		"Applicable policy packs:",
		"Role bundles:",
		"Decision surfaces:",
		"DLP findings:",
	} {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in %s", part, rendered)
		}
	}
	if strings.Contains(rendered, "sk-1234567890abcdefghijklmnop") || strings.Contains(rendered, "Bearer abcdefghijklmnopqrstuvwxyz012345") {
		t.Fatalf("report leaked secret-like content: %s", rendered)
	}
}

func TestRenderCLIFollowReportDeltaIncludesReportType(t *testing.T) {
	client := newCLIReportTestClient(t)
	view := buildCLIParityThreadReview(t)
	rendered, err := renderCLIFollowReport(context.Background(), client, view.Timeline, view.Timeline.Events[:1], true, runtimeclient.EnterpriseReportSelection{})
	if err != nil {
		t.Fatalf("renderCLIFollowReport() error = %v", err)
	}
	for _, part := range []string{
		"AgentOps CLI governance report",
		"Type: delta-report",
		"Decision surfaces:",
	} {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in %s", part, rendered)
		}
	}
}

func TestRenderCLIReportAppliesExplicitSelection(t *testing.T) {
	client := newCLIReportTestClient(t)
	view := buildCLIParityThreadReview(t)
	rendered, err := renderCLIReport(context.Background(), client, view, runtimeclient.EnterpriseReportSelection{
		RetentionClass: "archive",
		Audience:       "security_review",
	})
	if err != nil {
		t.Fatalf("renderCLIReport() selection error = %v", err)
	}
	if !strings.Contains(rendered, "Audience: security_review") || !strings.Contains(rendered, "Retention class: archive") {
		t.Fatalf("selection not applied in report: %s", rendered)
	}
}

func newCLIReportTestClient(t *testing.T) *runtimeclient.Client {
	t.Helper()
	httpClient := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		var payload interface{}
		switch {
		case req.Method == http.MethodGet && req.URL.Path == "/v1alpha2/runtime/worker-capabilities":
			payload = runtimeapi.WorkerCapabilityCatalogResponse{
				Count: 1,
				Items: []runtimeapi.WorkerCapabilityCatalogEntry{{
					Label:                "Managed Codex Worker",
					ExecutionMode:        runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
					WorkerType:           "managed_agent",
					AdapterID:            "codex",
					Provider:             "agentops_gateway",
					BoundaryRequirements: []string{"governed_tool_execution"},
				}},
			}
		case req.Method == http.MethodGet && req.URL.Path == "/v1alpha2/runtime/policy-packs":
			payload = runtimeapi.PolicyPackCatalogResponse{
				Count: 1,
				Items: []runtimeapi.PolicyPackCatalogEntry{{
					PackID:                   "managed_codex_worker_operator",
					Label:                    "Managed Codex Worker Operator",
					RoleBundles:              []string{"enterprise.operator", "enterprise.worker_controller"},
					DecisionSurfaces:         []string{"approval_checkpoint", "tool_proposal"},
					ApplicableExecutionModes: []string{runtimeapi.AgentInvokeExecutionModeManagedCodexWorker},
					ApplicableWorkerTypes:    []string{"managed_agent"},
					ApplicableAdapterIDs:     []string{"codex"},
					ClientSurfaces:           []string{"cli"},
					ReportingSurfaces:        []string{"report", "delta-report"},
					BoundaryRequirements:     []string{"agentops_gateway_boundary"},
				}},
			}
		case req.Method == http.MethodGet && req.URL.Path == "/v1alpha2/runtime/export-profiles":
			reportType := req.URL.Query().Get("reportType")
			payload = runtimeapi.ExportProfileCatalogResponse{
				Count: 1,
				Items: []runtimeapi.ExportProfileCatalogEntry{{
					ExportProfile:           map[bool]string{true: "operator_follow", false: "operator_review"}[strings.Contains(reportType, "delta")],
					Label:                   map[bool]string{true: "Operator Follow", false: "Operator Review"}[strings.Contains(reportType, "delta")],
					DefaultAudience:         "operator",
					AllowedAudiences:        []string{"operator", "security_review"},
					DefaultRetentionClass:   map[bool]string{true: "short", false: "standard"}[strings.Contains(reportType, "delta")],
					AllowedRetentionClasses: []string{"short", "standard", "archive"},
					ClientSurfaces:          []string{"cli"},
					ReportTypes:             []string{"report", "delta-report"},
					DeliveryChannels:        []string{"report", "stream"},
					RedactionMode:           "structured_and_text",
				}},
			}
		case req.Method == http.MethodGet && req.URL.Path == "/v1alpha2/runtime/org-admin-profiles":
			payload = runtimeapi.OrgAdminCatalogResponse{
				Count: 1,
				Items: []runtimeapi.OrgAdminCatalogEntry{{
					ProfileID:                 "centralized_enterprise_admin",
					Label:                     "Centralized Enterprise Admin",
					OrganizationModel:         "centralized_enterprise",
					DelegationModel:           "central_it_with_tenant_project_delegation",
					AdminRoleBundles:          []string{"enterprise.org_admin"},
					DelegatedAdminRoleBundles: []string{"enterprise.tenant_admin"},
					BreakGlassRoleBundles:     []string{"enterprise.break_glass_admin"},
					DirectorySyncInputs:       []string{"idp_group", "tenant_id"},
					ResidencyProfiles:         []string{"single_region_tenant_pinning"},
					ResidencyExceptionInputs:  []string{"residency_exception_ticket"},
					LegalHoldProfiles:         []string{"litigation_hold"},
					LegalHoldExceptionInputs:  []string{"legal_hold_case_id"},
					NetworkBoundaryProfiles:   []string{"enterprise_proxy_required"},
					FleetRolloutProfiles:      []string{"mdm_managed_desktop_ring"},
					QuotaDimensions:           []string{"organization", "tenant"},
					QuotaOverlayInputs:        []string{"tenant_id"},
					ChargebackDimensions:      []string{"cost_center"},
					ChargebackOverlayInputs:   []string{"cost_center"},
					EnforcementHooks:          []string{"delegated_admin_scope_guard"},
					BoundaryRequirements:      []string{"runtime_authz"},
					ReportingSurfaces:         []string{"admin_report"},
					ClientSurfaces:            []string{"cli"},
				}},
			}
		default:
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader("not found")),
				Request:    req,
			}, nil
		}
		body, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(string(body))),
			Request:    req,
		}, nil
	})}
	cfg := runtimeclient.Config{RuntimeAPIBaseURL: "http://runtime.test", TenantID: "tenant-local", ProjectID: "project-local"}
	return runtimeclient.NewClientWithHTTPClient(cfg, httpClient)
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}
