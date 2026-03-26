package runtime

import (
	"context"
	"strings"
	"testing"
)

func browserConnectorSettingsFixture(allowedOrigins []string) map[string]interface{} {
	return map[string]interface{}{
		"selectedConnectorId": "browser-proof",
		"profiles": []map[string]interface{}{
			{
				"id":             "browser-proof",
				"label":          "Browser Proof",
				"driver":         connectorDriverMCPBrowser,
				"allowedTools":   []string{connectorToolGetPageMetadata, connectorToolExtractText, connectorToolClickDestructiveButton},
				"allowedOrigins": allowedOrigins,
				"enabled":        true,
			},
		},
	}
}

func TestExecuteMCPBrowserConnectorMetadataAndText(t *testing.T) {
	allowedOrigin := "http://browser-proof.local"
	restorePreflight := stubBrowserConnectorPreflight(func(target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorNavigation, error) {
		return browserConnectorNavigation{
			FinalURL:    target.NormalizedURL,
			FinalOrigin: target.Origin,
		}, nil
	})
	defer restorePreflight()
	restoreFetch := stubBrowserConnectorFetch(func(_ context.Context, target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorFetchResult, error) {
		return browserConnectorFetchResult{
			FinalURL:               target.NormalizedURL,
			FinalOrigin:            target.Origin,
			StatusCode:             200,
			ContentType:            "text/html",
			Title:                  "Bounded Browser Proof",
			TextPreview:            "alpha browser proof read only browser connector text extraction",
			BytesRead:              160,
			ResultPreviewTruncated: false,
		}, nil
	})
	defer restoreFetch()

	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(browserConnectorSettingsFixture([]string{allowedOrigin})))
	if err != nil {
		t.Fatalf("parse browser connector settings: %v", err)
	}

	metadataPlan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "browser-proof",
			Driver:      connectorDriverMCPBrowser,
			ToolName:    connectorToolGetPageMetadata,
			Arguments: JSONObject{
				"url": allowedOrigin + "/articles/proof",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan(metadata) error = %v", err)
	}
	if got := metadataPlan.Classification["statementClass"]; got != "page_metadata_read" {
		t.Fatalf("metadata classification=%v want page_metadata_read", got)
	}

	metadataResult, err := executeConnectorPlan(context.Background(), metadataPlan)
	if err != nil {
		t.Fatalf("executeConnectorPlan(metadata) error = %v", err)
	}
	if got, want := metadataResult["driver"], connectorDriverMCPBrowser; got != want {
		t.Fatalf("driver=%v want %v", got, want)
	}
	if got, want := metadataResult["pageTitle"], "Bounded Browser Proof"; got != want {
		t.Fatalf("pageTitle=%v want %v", got, want)
	}

	textPlan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "browser-proof",
			Driver:      connectorDriverMCPBrowser,
			ToolName:    connectorToolExtractText,
			Arguments: JSONObject{
				"url": allowedOrigin + "/articles/proof",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan(text) error = %v", err)
	}
	if got := textPlan.Classification["statementClass"]; got != "page_text_extract" {
		t.Fatalf("text classification=%v want page_text_extract", got)
	}

	textResult, err := executeConnectorPlan(context.Background(), textPlan)
	if err != nil {
		t.Fatalf("executeConnectorPlan(text) error = %v", err)
	}
	textPreview, _ := textResult["textPreview"].(string)
	if !strings.Contains(textPreview, "alpha browser proof") {
		t.Fatalf("textPreview=%q want alpha browser proof", textPreview)
	}
}

func TestExecuteMCPBrowserConnectorRejectsUnsupportedScheme(t *testing.T) {
	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(browserConnectorSettingsFixture([]string{"http://browser-proof.local"})))
	if err != nil {
		t.Fatalf("parse browser connector settings: %v", err)
	}

	plan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "browser-proof",
			Driver:      connectorDriverMCPBrowser,
			ToolName:    connectorToolGetPageMetadata,
			Arguments: JSONObject{
				"url": "file:///etc/passwd",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan() error = %v", err)
	}
	if got := plan.Classification["statementClass"]; got != "unsupported_scheme" {
		t.Fatalf("classification=%v want unsupported_scheme", got)
	}
	if got := plan.Classification["readOnlyCandidate"]; got != false {
		t.Fatalf("readOnlyCandidate=%v want false", got)
	}
	if _, err := executeConnectorPlan(context.Background(), plan); err == nil || !strings.Contains(strings.ToLower(err.Error()), "http or https") {
		t.Fatalf("expected unsupported scheme denial, got err=%v", err)
	}
}

func TestExecuteMCPBrowserConnectorRejectsOutOfScope(t *testing.T) {
	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(browserConnectorSettingsFixture([]string{"http://browser-proof.local"})))
	if err != nil {
		t.Fatalf("parse browser connector settings: %v", err)
	}

	plan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "browser-proof",
			Driver:      connectorDriverMCPBrowser,
			ToolName:    connectorToolGetPageMetadata,
			Arguments: JSONObject{
				"url": "https://outside.local/secret",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan() error = %v", err)
	}
	if got := plan.Classification["statementClass"]; got != "url_out_of_scope" {
		t.Fatalf("classification=%v want url_out_of_scope", got)
	}
	if _, err := executeConnectorPlan(context.Background(), plan); err == nil || !strings.Contains(strings.ToLower(err.Error()), "outside the bounded browser connector allowlist") {
		t.Fatalf("expected out-of-scope denial, got err=%v", err)
	}
}

func TestExecuteMCPBrowserConnectorRejectsRedirectOutOfScope(t *testing.T) {
	allowedOrigin := "http://browser-proof.local"
	blockedOrigin := "http://blocked.local"
	restorePreflight := stubBrowserConnectorPreflight(func(target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorNavigation, error) {
		if target.NormalizedURL == allowedOrigin+"/redirect-out" {
			return browserConnectorNavigation{}, browserConnectorClassifiedError{
				StatementClass: "redirect_out_of_scope",
				Reason:         "browser redirect target leaves the bounded browser connector allowlist",
				RequestedURL:   target.RequestedURL,
				NormalizedURL:  target.NormalizedURL,
				Origin:         target.Origin,
				FinalURL:       blockedOrigin + "/blocked",
				FinalOrigin:    blockedOrigin,
			}
		}
		return browserConnectorNavigation{
			FinalURL:    target.NormalizedURL,
			FinalOrigin: target.Origin,
		}, nil
	})
	defer restorePreflight()
	fetchCalls := 0
	restoreFetch := stubBrowserConnectorFetch(func(_ context.Context, target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorFetchResult, error) {
		fetchCalls++
		return browserConnectorFetchResult{}, nil
	})
	defer restoreFetch()

	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(browserConnectorSettingsFixture([]string{allowedOrigin})))
	if err != nil {
		t.Fatalf("parse browser connector settings: %v", err)
	}

	plan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "browser-proof",
			Driver:      connectorDriverMCPBrowser,
			ToolName:    connectorToolGetPageMetadata,
			Arguments: JSONObject{
				"url": allowedOrigin + "/redirect-out",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan() error = %v", err)
	}
	if got := plan.Classification["statementClass"]; got != "redirect_out_of_scope" {
		t.Fatalf("classification=%v want redirect_out_of_scope", got)
	}
	if _, err := executeConnectorPlan(context.Background(), plan); err == nil || !strings.Contains(strings.ToLower(err.Error()), "redirect target leaves the bounded browser connector allowlist") {
		t.Fatalf("expected redirect out-of-scope denial, got err=%v", err)
	}
	if fetchCalls != 0 {
		t.Fatalf("browser fetch calls=%d want 0", fetchCalls)
	}
}

func TestExecuteMCPBrowserConnectorClickDestructiveButtonRequiresApprovalAndExecutesAfterApproval(t *testing.T) {
	allowedOrigin := "http://browser-proof.local"
	restoreInspect := stubBrowserConnectorInspect(func(target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorTarget, error) {
		target.FinalURL = target.NormalizedURL
		target.FinalOrigin = target.Origin
		target.ResolvedLabel = "Delete draft"
		target.ActionURL = allowedOrigin + "/danger/delete"
		target.ActionMethod = "POST"
		target.ControlFingerprint = "#delete-button|Delete draft|POST|" + allowedOrigin + "/danger/delete"
		return target, nil
	})
	defer restoreInspect()
	clickCalls := 0
	restoreClick := stubBrowserConnectorClick(func(_ context.Context, target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorClickResult, error) {
		clickCalls++
		return browserConnectorClickResult{
			FinalURL:    allowedOrigin + "/articles/deleted",
			FinalOrigin: allowedOrigin,
			StatusCode:  200,
			PageTitle:   "Deleted",
		}, nil
	})
	defer restoreClick()

	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(browserConnectorSettingsFixture([]string{allowedOrigin})))
	if err != nil {
		t.Fatalf("parse browser connector settings: %v", err)
	}

	deferredPlan, err := deriveConnectorExecutionPlan(browserConnectorDestructiveRunRequest("req-browser-click-defer", allowedOrigin+"/articles/proof", "#delete-button", "Delete draft", false, ""), settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan(defer) error = %v", err)
	}
	if got := deferredPlan.Classification["statementClass"]; got != "destructive_button_click" {
		t.Fatalf("classification=%v want destructive_button_click", got)
	}
	if got := deferredPlan.Classification["approvalRequired"]; got != true {
		t.Fatalf("approvalRequired=%v want true", got)
	}
	if _, err := executeConnectorPlan(context.Background(), deferredPlan); err == nil || !strings.Contains(strings.ToLower(err.Error()), "requires human approval") {
		t.Fatalf("expected approval backstop denial, got err=%v", err)
	}
	if clickCalls != 0 {
		t.Fatalf("clickCalls=%d want 0 before approval", clickCalls)
	}

	approvedPlan, err := deriveConnectorExecutionPlan(browserConnectorDestructiveRunRequest("req-browser-click-allow", allowedOrigin+"/articles/proof", "#delete-button", "Delete draft", true, "approval-browser-proof"), settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan(allow) error = %v", err)
	}
	result, err := executeConnectorPlan(context.Background(), approvedPlan)
	if err != nil {
		t.Fatalf("executeConnectorPlan(allow) error = %v", err)
	}
	if result["clicked"] != true {
		t.Fatalf("clicked=%v want true", result["clicked"])
	}
	if got := result["approvalId"]; got != "approval-browser-proof" {
		t.Fatalf("approvalId=%v want approval-browser-proof", got)
	}
	if clickCalls != 1 {
		t.Fatalf("clickCalls=%d want 1 after approval", clickCalls)
	}
}

func TestExecuteMCPBrowserConnectorRejectsDestructiveControlDenies(t *testing.T) {
	allowedOrigin := "http://browser-proof.local"
	testCases := []struct {
		name           string
		statementClass string
		reason         string
	}{
		{
			name:           "selector not found",
			statementClass: "selector_not_found",
			reason:         "selector did not resolve",
		},
		{
			name:           "selector ambiguous",
			statementClass: "selector_ambiguous",
			reason:         "selector resolved to multiple",
		},
		{
			name:           "label mismatch",
			statementClass: "label_mismatch",
			reason:         "label did not match",
		},
		{
			name:           "control not destructive",
			statementClass: "control_not_destructive",
			reason:         "did not resolve to a destructive control label",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			restoreInspect := stubBrowserConnectorInspect(func(target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorTarget, error) {
				return browserConnectorTarget{}, browserConnectorClassifiedError{
					StatementClass: tc.statementClass,
					Reason:         tc.reason,
					RequestedURL:   target.RequestedURL,
					NormalizedURL:  target.NormalizedURL,
					Origin:         target.Origin,
					FinalURL:       target.NormalizedURL,
					FinalOrigin:    target.Origin,
				}
			})
			defer restoreInspect()

			settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(browserConnectorSettingsFixture([]string{allowedOrigin})))
			if err != nil {
				t.Fatalf("parse browser connector settings: %v", err)
			}

			plan, err := deriveConnectorExecutionPlan(browserConnectorDestructiveRunRequest("req-"+tc.statementClass, allowedOrigin+"/articles/proof", "#delete-button", "Delete draft", false, ""), settings)
			if err != nil {
				t.Fatalf("deriveConnectorExecutionPlan() error = %v", err)
			}
			if got := plan.Classification["statementClass"]; got != tc.statementClass {
				t.Fatalf("classification=%v want %s", got, tc.statementClass)
			}
			if _, err := executeConnectorPlan(context.Background(), plan); err == nil || !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(strings.TrimSpace(tc.reason))) {
				t.Fatalf("expected classified denial containing %q, got err=%v", tc.reason, err)
			}
		})
	}
}

func TestExecuteRunConnectorBrowserAllowedAndDenied(t *testing.T) {
	allowedOrigin := "http://browser-proof.local"
	blockedOrigin := "http://blocked.local"
	restorePreflight := stubBrowserConnectorPreflight(func(target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorNavigation, error) {
		if target.NormalizedURL == allowedOrigin+"/redirect-out" {
			return browserConnectorNavigation{}, browserConnectorClassifiedError{
				StatementClass: "redirect_out_of_scope",
				Reason:         "browser redirect target leaves the bounded browser connector allowlist",
				RequestedURL:   target.RequestedURL,
				NormalizedURL:  target.NormalizedURL,
				Origin:         target.Origin,
				FinalURL:       blockedOrigin + "/blocked",
				FinalOrigin:    blockedOrigin,
			}
		}
		return browserConnectorNavigation{
			FinalURL:    target.NormalizedURL,
			FinalOrigin: target.Origin,
		}, nil
	})
	defer restorePreflight()
	fetchCalls := 0
	restoreFetch := stubBrowserConnectorFetch(func(_ context.Context, target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorFetchResult, error) {
		fetchCalls++
		return browserConnectorFetchResult{
			FinalURL:               target.NormalizedURL,
			FinalOrigin:            target.Origin,
			StatusCode:             200,
			ContentType:            "text/html",
			Title:                  "Bounded Browser Proof",
			TextPreview:            "alpha browser proof read only browser connector text extraction",
			BytesRead:              160,
			ResultPreviewTruncated: false,
		}, nil
	})
	defer restoreFetch()

	store := newMemoryRunStore()
	if err := store.UpsertConnectorSettings(context.Background(), &ConnectorSettingsRecord{
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Settings:  mustMarshalJSON(browserConnectorSettingsFixture([]string{allowedOrigin})),
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

	allowRun, err := orch.ExecuteRun(context.Background(), browserConnectorRunRequest("req-browser-allow", connectorToolGetPageMetadata, allowedOrigin+"/articles/proof"))
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
	if allowResult["pageTitle"] != "Bounded Browser Proof" {
		t.Fatalf("allow connector pageTitle=%v want Bounded Browser Proof", allowResult["pageTitle"])
	}

	denyRun, err := orch.ExecuteRun(context.Background(), browserConnectorRunRequest("req-browser-deny", connectorToolGetPageMetadata, allowedOrigin+"/redirect-out"))
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
	if classification["statementClass"] != "redirect_out_of_scope" {
		t.Fatalf("deny connector classification=%v want redirect_out_of_scope", classification["statementClass"])
	}
	if fetchCalls != 1 {
		t.Fatalf("browser fetch calls=%d want 1", fetchCalls)
	}
}

func TestExecuteRunConnectorBrowserDestructiveClickDeferredThenApproved(t *testing.T) {
	allowedOrigin := "http://browser-proof.local"
	restoreInspect := stubBrowserConnectorInspect(func(target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorTarget, error) {
		target.FinalURL = target.NormalizedURL
		target.FinalOrigin = target.Origin
		target.ResolvedLabel = "Delete draft"
		target.ActionURL = allowedOrigin + "/danger/delete"
		target.ActionMethod = "POST"
		target.ControlFingerprint = "#delete-button|Delete draft|POST|" + allowedOrigin + "/danger/delete"
		return target, nil
	})
	defer restoreInspect()
	clickCalls := 0
	restoreClick := stubBrowserConnectorClick(func(_ context.Context, target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorClickResult, error) {
		clickCalls++
		return browserConnectorClickResult{
			FinalURL:    allowedOrigin + "/articles/deleted",
			FinalOrigin: allowedOrigin,
			StatusCode:  200,
			PageTitle:   "Deleted",
		}, nil
	})
	defer restoreClick()

	store := newMemoryRunStore()
	if err := store.UpsertConnectorSettings(context.Background(), &ConnectorSettingsRecord{
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Settings:  mustMarshalJSON(browserConnectorSettingsFixture([]string{allowedOrigin})),
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

	deferredRun, err := orch.ExecuteRun(context.Background(), browserConnectorDestructiveRunRequest("req-browser-click-defer", allowedOrigin+"/articles/proof", "#delete-button", "Delete draft", false, ""))
	if err != nil {
		t.Fatalf("defer ExecuteRun() error = %v", err)
	}
	if deferredRun.PolicyDecision != "DEFER" {
		t.Fatalf("deferred run policy=%q want DEFER", deferredRun.PolicyDecision)
	}
	deferredPayload := evidencePayloadEcho(t, deferredRun.EvidenceRecordResponse)
	deferredConnectorPayload, _ := deferredPayload["connector"].(map[string]interface{})
	if deferredConnectorPayload["state"] != "skipped" {
		t.Fatalf("deferred connector state=%v want skipped", deferredConnectorPayload["state"])
	}
	if clickCalls != 0 {
		t.Fatalf("clickCalls=%d want 0 before approval", clickCalls)
	}

	approvedRun, err := orch.ExecuteRun(context.Background(), browserConnectorDestructiveRunRequest("req-browser-click-allow", allowedOrigin+"/articles/proof", "#delete-button", "Delete draft", true, "approval-browser-proof"))
	if err != nil {
		t.Fatalf("approved ExecuteRun() error = %v", err)
	}
	if approvedRun.PolicyDecision != "ALLOW" {
		t.Fatalf("approved run policy=%q want ALLOW", approvedRun.PolicyDecision)
	}
	approvedPayload := evidencePayloadEcho(t, approvedRun.EvidenceRecordResponse)
	approvedConnectorPayload, _ := approvedPayload["connector"].(map[string]interface{})
	if approvedConnectorPayload["state"] != "completed" {
		t.Fatalf("approved connector state=%v want completed", approvedConnectorPayload["state"])
	}
	approvedResult, _ := approvedConnectorPayload["result"].(map[string]interface{})
	if approvedResult["clicked"] != true {
		t.Fatalf("approved clicked=%v want true", approvedResult["clicked"])
	}
	if clickCalls != 1 {
		t.Fatalf("clickCalls=%d want 1 after approval", clickCalls)
	}
}

func browserConnectorRunRequest(requestID, toolName, pageURL string) RunCreateRequest {
	actionType := "connector.browser.get_page_metadata"
	actionVerb := "observe"
	if toolName == connectorToolExtractText {
		actionType = "connector.browser.extract_text"
		actionVerb = "read"
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
			"kind": "browser-page",
			"name": pageURL,
		},
		Context: JSONObject{
			"source": "browser-proof",
		},
		Connector: &ConnectorExecutionRequest{
			Enabled:      true,
			Tier:         connectorTierReadOnly,
			ConnectorID:  "browser-proof",
			Driver:       connectorDriverMCPBrowser,
			ToolName:     toolName,
			ApprovalNote: "Browser proof connector request.",
			Arguments: JSONObject{
				"url": pageURL,
			},
		},
	}
}

func browserConnectorDestructiveRunRequest(requestID, pageURL, selector, expectedLabel string, approved bool, approvalID string) RunCreateRequest {
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
			"type":  "connector.browser.click_destructive_button",
			"class": "connector_write",
			"verb":  "click",
		},
		Resource: JSONObject{
			"kind": "browser-page-control",
			"name": pageURL,
		},
		Context: JSONObject{
			"source": "browser-proof",
		},
		Connector: &ConnectorExecutionRequest{
			Enabled:              true,
			Tier:                 connectorTierReadOnly,
			ConnectorID:          "browser-proof",
			Driver:               connectorDriverMCPBrowser,
			ToolName:             connectorToolClickDestructiveButton,
			ApprovalNote:         "Browser destructive proof connector request.",
			ApprovalID:           approvalID,
			HumanApprovalGranted: approved,
			Arguments: JSONObject{
				"url":            pageURL,
				"selector":       selector,
				"expected_label": expectedLabel,
			},
		},
	}
}

func stubBrowserConnectorPreflight(fn func(browserConnectorTarget, connectorProfileConfig) (browserConnectorNavigation, error)) func() {
	previous := preflightBrowserConnectorNavigation
	preflightBrowserConnectorNavigation = fn
	return func() {
		preflightBrowserConnectorNavigation = previous
	}
}

func stubBrowserConnectorFetch(fn func(context.Context, browserConnectorTarget, connectorProfileConfig) (browserConnectorFetchResult, error)) func() {
	previous := executeBrowserConnectorFetch
	executeBrowserConnectorFetch = fn
	return func() {
		executeBrowserConnectorFetch = previous
	}
}

func stubBrowserConnectorInspect(fn func(browserConnectorTarget, connectorProfileConfig) (browserConnectorTarget, error)) func() {
	previous := inspectBrowserConnectorControl
	inspectBrowserConnectorControl = fn
	return func() {
		inspectBrowserConnectorControl = previous
	}
}

func stubBrowserConnectorClick(fn func(context.Context, browserConnectorTarget, connectorProfileConfig) (browserConnectorClickResult, error)) func() {
	previous := executeBrowserConnectorClick
	executeBrowserConnectorClick = fn
	return func() {
		executeBrowserConnectorClick = previous
	}
}
