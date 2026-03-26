package runtime

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	connectorBrowserMetadataReadLimit = 16384
	connectorBrowserTextReadLimit     = 65536
	connectorBrowserPreviewBytes      = 4096
)

var (
	connectorBrowserTitlePattern      = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	connectorBrowserScriptPattern     = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	connectorBrowserStylePattern      = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	connectorBrowserTagPattern        = regexp.MustCompile(`(?s)<[^>]+>`)
	connectorBrowserWhitespacePattern = regexp.MustCompile(`\s+`)
	connectorBrowserButtonPattern     = regexp.MustCompile(`(?is)<button\b([^>]*)>(.*?)</button>`)
	connectorBrowserAttrPattern       = regexp.MustCompile(`(?i)([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))`)
)

type browserConnectorTarget struct {
	RequestedURL       string
	NormalizedURL      string
	Origin             string
	FinalURL           string
	FinalOrigin        string
	StatementClass     string
	PrimaryVerb        string
	Operation          string
	ResourceKind       string
	ReadOnlyCandidate  bool
	ApprovalRequired   bool
	Blocked            bool
	Reason             string
	Selector           string
	ExpectedLabel      string
	ResolvedLabel      string
	ActionURL          string
	ActionMethod       string
	ControlFingerprint string
}

type browserConnectorFetchResult struct {
	FinalURL               string
	FinalOrigin            string
	StatusCode             int
	ContentType            string
	Title                  string
	TextPreview            string
	BytesRead              int
	ResultPreviewTruncated bool
}

type browserConnectorClickResult struct {
	FinalURL    string
	FinalOrigin string
	StatusCode  int
	PageTitle   string
}

type browserConnectorButtonMatch struct {
	Attributes map[string]string
	InnerHTML  string
}

type browserConnectorClassifiedError struct {
	StatementClass string
	Reason         string
	RequestedURL   string
	NormalizedURL  string
	Origin         string
	FinalURL       string
	FinalOrigin    string
}

func (e browserConnectorClassifiedError) Error() string {
	return e.Reason
}

var preflightBrowserConnectorNavigation = preflightBrowserConnectorNavigationReal
var executeBrowserConnectorFetch = executeBrowserConnectorFetchReal
var inspectBrowserConnectorControl = inspectBrowserConnectorControlReal
var executeBrowserConnectorClick = executeBrowserConnectorClickReal

func normalizeAndClassifyBrowserConnectorRequest(profile connectorProfileConfig, toolName string, args JSONObject) (JSONObject, JSONObject, error) {
	out := cloneJSONObject(args)
	requestedURL := strings.TrimSpace(connectorString(out["url"]))
	if requestedURL == "" {
		return nil, nil, fmt.Errorf("connector.arguments.url is required")
	}

	selector := ""
	expectedLabel := ""
	if toolName == connectorToolClickDestructiveButton {
		selector = normalizeBrowserSelector(connectorString(out["selector"]))
		if selector == "" {
			return nil, nil, fmt.Errorf("connector.arguments.selector is required")
		}
		expectedLabel = collapseBrowserWhitespace(firstNonEmpty(connectorString(out["expected_label"]), connectorString(out["expectedLabel"])))
		if expectedLabel == "" {
			return nil, nil, fmt.Errorf("connector.arguments.expected_label is required")
		}
		delete(out, "expectedLabel")
	}

	target, err := classifyBrowserConnectorTarget(profile, toolName, requestedURL, selector, expectedLabel)
	if err != nil {
		return nil, nil, err
	}
	out["url"] = target.NormalizedURL
	if selector != "" {
		out["selector"] = target.Selector
		out["expected_label"] = target.ExpectedLabel
	}
	return out, buildBrowserConnectorClassification(target), nil
}

func executeMCPBrowserConnector(ctx context.Context, plan *connectorExecutionPlan) (map[string]interface{}, error) {
	if plan == nil {
		return nil, fmt.Errorf("connector execution plan is not enabled")
	}
	if blocked, _ := plan.Classification["blocked"].(bool); blocked {
		return nil, browserConnectorClassifiedError{
			StatementClass: strings.TrimSpace(connectorString(plan.Classification["statementClass"])),
			Reason:         strings.TrimSpace(connectorString(plan.Classification["reason"])),
			RequestedURL:   strings.TrimSpace(connectorString(plan.Classification["requestedUrl"])),
			NormalizedURL:  strings.TrimSpace(connectorString(plan.Classification["normalizedUrl"])),
			Origin:         strings.TrimSpace(connectorString(plan.Classification["origin"])),
			FinalURL:       strings.TrimSpace(connectorString(plan.Classification["finalUrl"])),
			FinalOrigin:    strings.TrimSpace(connectorString(plan.Classification["finalOrigin"])),
		}
	}
	requestedURL, _ := plan.Arguments["url"].(string)
	selector, _ := plan.Arguments["selector"].(string)
	expectedLabel, _ := plan.Arguments["expected_label"].(string)

	target, err := classifyBrowserConnectorTarget(plan.Profile, plan.ToolName, requestedURL, selector, expectedLabel)
	if err != nil {
		return nil, err
	}
	if target.Blocked {
		return nil, browserConnectorClassifiedError{
			StatementClass: target.StatementClass,
			Reason:         target.Reason,
			RequestedURL:   target.RequestedURL,
			NormalizedURL:  target.NormalizedURL,
			Origin:         target.Origin,
			FinalURL:       target.FinalURL,
			FinalOrigin:    target.FinalOrigin,
		}
	}

	switch plan.ToolName {
	case connectorToolGetPageMetadata, connectorToolExtractText:
		fetchResult, err := executeBrowserConnectorFetch(ctx, target, plan.Profile)
		if err != nil {
			return nil, err
		}

		result := map[string]interface{}{
			"driver":                 connectorDriverMCPBrowser,
			"toolName":               plan.ToolName,
			"connectorId":            plan.Profile.ID,
			"connectorLabel":         plan.Profile.Label,
			"requestedUrl":           target.RequestedURL,
			"normalizedUrl":          target.NormalizedURL,
			"origin":                 target.Origin,
			"finalUrl":               fetchResult.FinalURL,
			"finalOrigin":            fetchResult.FinalOrigin,
			"statusCode":             fetchResult.StatusCode,
			"contentType":            fetchResult.ContentType,
			"pageTitle":              fetchResult.Title,
			"bytesRead":              fetchResult.BytesRead,
			"resultPreviewTruncated": fetchResult.ResultPreviewTruncated,
		}
		switch plan.ToolName {
		case connectorToolGetPageMetadata:
			result["metadataPreview"] = map[string]interface{}{
				"title":       fetchResult.Title,
				"statusCode":  fetchResult.StatusCode,
				"contentType": fetchResult.ContentType,
				"finalUrl":    fetchResult.FinalURL,
			}
		case connectorToolExtractText:
			result["textPreview"] = fetchResult.TextPreview
		}
		if note := strings.TrimSpace(plan.ApprovalNote); note != "" {
			result["approvalNote"] = note
		}
		if approvalID := strings.TrimSpace(plan.ApprovalID); approvalID != "" {
			result["approvalId"] = approvalID
		}
		return result, nil
	case connectorToolClickDestructiveButton:
		if !plan.HumanApprovalGranted {
			return nil, fmt.Errorf("browser destructive click requires human approval before execution")
		}
		clickResult, err := executeBrowserConnectorClick(ctx, target, plan.Profile)
		if err != nil {
			return nil, err
		}
		result := map[string]interface{}{
			"driver":               connectorDriverMCPBrowser,
			"toolName":             plan.ToolName,
			"connectorId":          plan.Profile.ID,
			"connectorLabel":       plan.Profile.Label,
			"requestedUrl":         target.RequestedURL,
			"normalizedUrl":        target.NormalizedURL,
			"origin":               target.Origin,
			"pageFinalUrl":         target.FinalURL,
			"pageFinalOrigin":      target.FinalOrigin,
			"selector":             target.Selector,
			"expectedLabel":        target.ExpectedLabel,
			"resolvedLabel":        target.ResolvedLabel,
			"actionUrl":            target.ActionURL,
			"actionMethod":         target.ActionMethod,
			"controlFingerprint":   target.ControlFingerprint,
			"clickStatusCode":      clickResult.StatusCode,
			"postClickFinalUrl":    clickResult.FinalURL,
			"postClickFinalOrigin": clickResult.FinalOrigin,
			"clicked":              true,
		}
		if strings.TrimSpace(clickResult.PageTitle) != "" {
			result["postClickPageTitle"] = clickResult.PageTitle
		}
		if note := strings.TrimSpace(plan.ApprovalNote); note != "" {
			result["approvalNote"] = note
		}
		if approvalID := strings.TrimSpace(plan.ApprovalID); approvalID != "" {
			result["approvalId"] = approvalID
		}
		return result, nil
	default:
		return nil, fmt.Errorf("connector tool %q is not supported", plan.ToolName)
	}
}

func classifyBrowserConnectorTarget(profile connectorProfileConfig, toolName, requestedURL, selector, expectedLabel string) (browserConnectorTarget, error) {
	target, err := classifyBrowserConnectorTargetWithoutPreflight(profile, toolName, requestedURL, selector, expectedLabel)
	if err != nil {
		return browserConnectorTarget{}, err
	}
	if target.Blocked {
		return target, nil
	}
	switch toolName {
	case connectorToolGetPageMetadata, connectorToolExtractText:
		navigation, err := preflightBrowserConnectorNavigation(target, profile)
		if err == nil {
			target.FinalURL = navigation.FinalURL
			target.FinalOrigin = navigation.FinalOrigin
			return target, nil
		}
		var classified browserConnectorClassifiedError
		if errors.As(err, &classified) {
			target.StatementClass = classified.StatementClass
			target.Blocked = true
			target.Reason = classified.Reason
			target.FinalURL = classified.FinalURL
			target.FinalOrigin = classified.FinalOrigin
			return target, nil
		}
		return browserConnectorTarget{}, err
	case connectorToolClickDestructiveButton:
		target, err = inspectBrowserConnectorControl(target, profile)
		if err == nil {
			return target, nil
		}
		var classified browserConnectorClassifiedError
		if errors.As(err, &classified) {
			target.StatementClass = classified.StatementClass
			target.Blocked = true
			target.Reason = classified.Reason
			target.FinalURL = classified.FinalURL
			target.FinalOrigin = classified.FinalOrigin
			return target, nil
		}
		return browserConnectorTarget{}, err
	default:
		return browserConnectorTarget{}, fmt.Errorf("connector tool %q is not supported", toolName)
	}
}

func classifyBrowserConnectorTargetWithoutPreflight(profile connectorProfileConfig, toolName, requestedURL, selector, expectedLabel string) (browserConnectorTarget, error) {
	requestedURL = strings.TrimSpace(requestedURL)
	if requestedURL == "" {
		return browserConnectorTarget{}, fmt.Errorf("connector.arguments.url is required")
	}

	statementClass := "page_metadata_read"
	primaryVerb := "observe"
	operation := "browser.page.metadata"
	resourceKind := "browser-page"
	readOnlyCandidate := true
	approvalRequired := false
	switch toolName {
	case connectorToolGetPageMetadata:
	case connectorToolExtractText:
		statementClass = "page_text_extract"
		primaryVerb = "read"
		operation = "browser.page.extract_text"
	case connectorToolClickDestructiveButton:
		statementClass = "destructive_button_click"
		primaryVerb = "click"
		operation = "browser.page.click_destructive_button"
		resourceKind = "browser-page-control"
		readOnlyCandidate = false
		approvalRequired = true
		selector = normalizeBrowserSelector(selector)
		if selector == "" {
			return browserConnectorTarget{}, fmt.Errorf("connector.arguments.selector is required")
		}
		expectedLabel = collapseBrowserWhitespace(expectedLabel)
		if expectedLabel == "" {
			return browserConnectorTarget{}, fmt.Errorf("connector.arguments.expected_label is required")
		}
	default:
		return browserConnectorTarget{}, fmt.Errorf("connector tool %q is not supported", toolName)
	}

	normalizedURL, origin, err := normalizeConnectorBrowserURL(requestedURL)
	if err != nil {
		return browserConnectorTarget{}, err
	}
	if origin == "" {
		return browserConnectorTarget{
			RequestedURL:      requestedURL,
			NormalizedURL:     normalizedURL,
			Origin:            origin,
			StatementClass:    "unsupported_scheme",
			PrimaryVerb:       primaryVerb,
			Operation:         operation,
			ResourceKind:      resourceKind,
			ReadOnlyCandidate: readOnlyCandidate,
			ApprovalRequired:  approvalRequired,
			Blocked:           true,
			Reason:            "browser connector only allows http or https URLs inside the configured origin allowlist",
			Selector:          selector,
			ExpectedLabel:     expectedLabel,
		}, nil
	}
	if !browserConnectorOriginAllowed(profile.AllowedOrigins, origin) {
		return browserConnectorTarget{
			RequestedURL:      requestedURL,
			NormalizedURL:     normalizedURL,
			Origin:            origin,
			StatementClass:    "url_out_of_scope",
			PrimaryVerb:       primaryVerb,
			Operation:         operation,
			ResourceKind:      resourceKind,
			ReadOnlyCandidate: readOnlyCandidate,
			ApprovalRequired:  approvalRequired,
			Blocked:           true,
			Reason:            "requested browser origin is outside the bounded browser connector allowlist",
			Selector:          selector,
			ExpectedLabel:     expectedLabel,
		}, nil
	}
	reason := "browser page is inside the bounded browser connector allowlist"
	if toolName == connectorToolClickDestructiveButton {
		reason = "destructive browser control is inside the bounded browser connector allowlist and requires operator approval"
	}
	return browserConnectorTarget{
		RequestedURL:      requestedURL,
		NormalizedURL:     normalizedURL,
		Origin:            origin,
		StatementClass:    statementClass,
		PrimaryVerb:       primaryVerb,
		Operation:         operation,
		ResourceKind:      resourceKind,
		ReadOnlyCandidate: readOnlyCandidate,
		ApprovalRequired:  approvalRequired,
		Reason:            reason,
		Selector:          selector,
		ExpectedLabel:     expectedLabel,
	}, nil
}

func buildBrowserConnectorClassification(target browserConnectorTarget) JSONObject {
	readOnlyCandidate := target.ReadOnlyCandidate && !target.Blocked
	classification := JSONObject{
		"statementClass":    target.StatementClass,
		"operation":         target.Operation,
		"primaryVerb":       target.PrimaryVerb,
		"readOnlyCandidate": readOnlyCandidate,
		"readOnly":          readOnlyCandidate,
		"approvalRequired":  target.ApprovalRequired,
		"blocked":           target.Blocked,
		"resourceKind":      target.ResourceKind,
		"requestedUrl":      target.RequestedURL,
		"normalizedUrl":     target.NormalizedURL,
		"origin":            target.Origin,
		"reason":            target.Reason,
	}
	if strings.TrimSpace(target.FinalURL) != "" {
		classification["finalUrl"] = target.FinalURL
	}
	if strings.TrimSpace(target.FinalOrigin) != "" {
		classification["finalOrigin"] = target.FinalOrigin
	}
	if strings.TrimSpace(target.Selector) != "" {
		classification["selector"] = target.Selector
	}
	if strings.TrimSpace(target.ExpectedLabel) != "" {
		classification["expectedLabel"] = target.ExpectedLabel
	}
	if strings.TrimSpace(target.ResolvedLabel) != "" {
		classification["resolvedLabel"] = target.ResolvedLabel
	}
	if strings.TrimSpace(target.ActionURL) != "" {
		classification["actionUrl"] = target.ActionURL
	}
	if strings.TrimSpace(target.ActionMethod) != "" {
		classification["actionMethod"] = target.ActionMethod
	}
	if strings.TrimSpace(target.ControlFingerprint) != "" {
		classification["controlFingerprint"] = target.ControlFingerprint
	}
	return classification
}

func normalizeConnectorOriginList(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		normalized, err := normalizeConnectorBrowserOrigin(value)
		if err != nil {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		out = append(out, normalized)
	}
	return out
}

func normalizeConnectorBrowserOrigin(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", fmt.Errorf("must be a non-empty origin")
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return "", fmt.Errorf("must be a valid http or https origin")
	}
	scheme := strings.ToLower(strings.TrimSpace(parsed.Scheme))
	if scheme != "http" && scheme != "https" {
		return "", fmt.Errorf("must use http:// or https:// format.")
	}
	host := strings.ToLower(strings.TrimSpace(parsed.Host))
	if host == "" {
		return "", fmt.Errorf("must include a hostname.")
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return "", fmt.Errorf("must not include a path.")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("must not include query or fragment components.")
	}
	return scheme + "://" + host, nil
}

func normalizeConnectorBrowserURL(raw string) (string, string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", "", fmt.Errorf("connector.arguments.url is required")
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return "", "", fmt.Errorf("connector.arguments.url must be a valid URL")
	}
	scheme := strings.ToLower(strings.TrimSpace(parsed.Scheme))
	host := strings.ToLower(strings.TrimSpace(parsed.Host))
	parsed.Scheme = scheme
	parsed.Host = host
	parsed.Fragment = ""
	if parsed.Path == "" {
		parsed.Path = "/"
	}
	normalizedURL := parsed.String()
	if scheme != "http" && scheme != "https" {
		return normalizedURL, "", nil
	}
	if host == "" {
		return "", "", fmt.Errorf("connector.arguments.url must include a hostname")
	}
	return normalizedURL, scheme + "://" + host, nil
}

func browserConnectorOriginAllowed(allowedOrigins []string, origin string) bool {
	normalizedOrigin := strings.ToLower(strings.TrimSpace(origin))
	for _, allowedOrigin := range allowedOrigins {
		if strings.ToLower(strings.TrimSpace(allowedOrigin)) == normalizedOrigin {
			return true
		}
	}
	return false
}

func normalizeBrowserSelector(raw string) string {
	return strings.TrimSpace(raw)
}

type browserConnectorNavigation struct {
	FinalURL    string
	FinalOrigin string
}

func preflightBrowserConnectorNavigationReal(target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorNavigation, error) {
	client := &http.Client{
		Timeout:       5 * time.Second,
		CheckRedirect: browserConnectorRedirectPolicy(target, profile),
	}
	resp, err := client.Get(target.NormalizedURL)
	if err != nil {
		var classified browserConnectorClassifiedError
		if errors.As(err, &classified) {
			return browserConnectorNavigation{}, classified
		}
		return browserConnectorNavigation{}, fmt.Errorf("preflight browser navigation: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1))
	finalURL, finalOrigin, err := normalizeConnectorBrowserURL(resp.Request.URL.String())
	if err != nil {
		return browserConnectorNavigation{}, fmt.Errorf("normalize browser final url: %w", err)
	}
	return browserConnectorNavigation{
		FinalURL:    finalURL,
		FinalOrigin: finalOrigin,
	}, nil
}

func executeBrowserConnectorFetchReal(ctx context.Context, target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorFetchResult, error) {
	client := &http.Client{
		Timeout:       10 * time.Second,
		CheckRedirect: browserConnectorRedirectPolicy(target, profile),
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.NormalizedURL, nil)
	if err != nil {
		return browserConnectorFetchResult{}, fmt.Errorf("build browser request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		var classified browserConnectorClassifiedError
		if errors.As(err, &classified) {
			return browserConnectorFetchResult{}, classified
		}
		return browserConnectorFetchResult{}, fmt.Errorf("execute browser request: %w", err)
	}
	defer resp.Body.Close()

	readLimit := connectorBrowserMetadataReadLimit
	if target.StatementClass == "page_text_extract" {
		readLimit = connectorBrowserTextReadLimit
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, int64(readLimit+1)))
	if err != nil {
		return browserConnectorFetchResult{}, fmt.Errorf("read browser response body: %w", err)
	}
	truncated := len(body) > readLimit
	if truncated {
		body = body[:readLimit]
	}
	finalURL, finalOrigin, err := normalizeConnectorBrowserURL(resp.Request.URL.String())
	if err != nil {
		return browserConnectorFetchResult{}, fmt.Errorf("normalize browser final url: %w", err)
	}
	title := extractBrowserHTMLTitle(body)
	textPreview := ""
	if target.StatementClass == "page_text_extract" {
		textPreview = extractBrowserHTMLText(body)
		if len(textPreview) > connectorBrowserPreviewBytes {
			textPreview = textPreview[:connectorBrowserPreviewBytes]
			truncated = true
		}
	}
	return browserConnectorFetchResult{
		FinalURL:               finalURL,
		FinalOrigin:            finalOrigin,
		StatusCode:             resp.StatusCode,
		ContentType:            normalizeBrowserContentType(resp.Header.Get("Content-Type")),
		Title:                  title,
		TextPreview:            textPreview,
		BytesRead:              len(body),
		ResultPreviewTruncated: truncated,
	}, nil
}

func inspectBrowserConnectorControlReal(target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorTarget, error) {
	client := &http.Client{
		Timeout:       10 * time.Second,
		CheckRedirect: browserConnectorRedirectPolicy(target, profile),
	}
	resp, err := client.Get(target.NormalizedURL)
	if err != nil {
		var classified browserConnectorClassifiedError
		if errors.As(err, &classified) {
			return browserConnectorTarget{}, classified
		}
		return browserConnectorTarget{}, fmt.Errorf("inspect browser control: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, int64(connectorBrowserTextReadLimit+1)))
	if err != nil {
		return browserConnectorTarget{}, fmt.Errorf("read browser control body: %w", err)
	}
	if len(body) > connectorBrowserTextReadLimit {
		body = body[:connectorBrowserTextReadLimit]
	}
	finalURL, finalOrigin, err := normalizeConnectorBrowserURL(resp.Request.URL.String())
	if err != nil {
		return browserConnectorTarget{}, fmt.Errorf("normalize browser final url: %w", err)
	}
	matches := browserConnectorButtonsBySelector(body, target.Selector)
	if len(matches) == 0 {
		return browserConnectorTarget{}, browserConnectorClassifiedError{
			StatementClass: "selector_not_found",
			Reason:         "browser destructive click selector did not resolve to a bounded button control",
			RequestedURL:   target.RequestedURL,
			NormalizedURL:  target.NormalizedURL,
			Origin:         target.Origin,
			FinalURL:       finalURL,
			FinalOrigin:    finalOrigin,
		}
	}
	if len(matches) > 1 {
		return browserConnectorTarget{}, browserConnectorClassifiedError{
			StatementClass: "selector_ambiguous",
			Reason:         "browser destructive click selector resolved to multiple bounded button controls",
			RequestedURL:   target.RequestedURL,
			NormalizedURL:  target.NormalizedURL,
			Origin:         target.Origin,
			FinalURL:       finalURL,
			FinalOrigin:    finalOrigin,
		}
	}

	resolvedLabel := collapseBrowserWhitespace(extractBrowserHTMLText([]byte(matches[0].InnerHTML)))
	if !strings.EqualFold(resolvedLabel, target.ExpectedLabel) {
		return browserConnectorTarget{}, browserConnectorClassifiedError{
			StatementClass: "label_mismatch",
			Reason:         "browser destructive click label did not match the expected bounded control label",
			RequestedURL:   target.RequestedURL,
			NormalizedURL:  target.NormalizedURL,
			Origin:         target.Origin,
			FinalURL:       finalURL,
			FinalOrigin:    finalOrigin,
		}
	}
	if !browserConnectorLabelDestructive(resolvedLabel) {
		return browserConnectorTarget{}, browserConnectorClassifiedError{
			StatementClass: "control_not_destructive",
			Reason:         "browser destructive click target did not resolve to a destructive control label",
			RequestedURL:   target.RequestedURL,
			NormalizedURL:  target.NormalizedURL,
			Origin:         target.Origin,
			FinalURL:       finalURL,
			FinalOrigin:    finalOrigin,
		}
	}

	formAction := strings.TrimSpace(matches[0].Attributes["formaction"])
	formMethod := strings.ToUpper(strings.TrimSpace(matches[0].Attributes["formmethod"]))
	if formAction == "" || formMethod == "" || formMethod != http.MethodPost {
		return browserConnectorTarget{}, browserConnectorClassifiedError{
			StatementClass: "control_not_clickable",
			Reason:         "browser destructive click only supports bounded button controls with explicit POST formaction targets",
			RequestedURL:   target.RequestedURL,
			NormalizedURL:  target.NormalizedURL,
			Origin:         target.Origin,
			FinalURL:       finalURL,
			FinalOrigin:    finalOrigin,
		}
	}

	baseURL, err := url.Parse(finalURL)
	if err != nil {
		return browserConnectorTarget{}, fmt.Errorf("parse browser final url: %w", err)
	}
	actionRef, err := url.Parse(formAction)
	if err != nil {
		return browserConnectorTarget{}, browserConnectorClassifiedError{
			StatementClass: "unsupported_scheme",
			Reason:         "browser destructive action target is not a supported http or https URL",
			RequestedURL:   target.RequestedURL,
			NormalizedURL:  target.NormalizedURL,
			Origin:         target.Origin,
			FinalURL:       finalURL,
			FinalOrigin:    finalOrigin,
		}
	}
	actionResolved := baseURL.ResolveReference(actionRef)
	actionURL, actionOrigin, err := normalizeConnectorBrowserURL(actionResolved.String())
	if err != nil || actionOrigin == "" {
		return browserConnectorTarget{}, browserConnectorClassifiedError{
			StatementClass: "unsupported_scheme",
			Reason:         "browser destructive action target is not a supported http or https URL",
			RequestedURL:   target.RequestedURL,
			NormalizedURL:  target.NormalizedURL,
			Origin:         target.Origin,
			FinalURL:       finalURL,
			FinalOrigin:    finalOrigin,
		}
	}
	if !browserConnectorOriginAllowed(profile.AllowedOrigins, actionOrigin) {
		return browserConnectorTarget{}, browserConnectorClassifiedError{
			StatementClass: "url_out_of_scope",
			Reason:         "browser destructive action target is outside the bounded browser connector allowlist",
			RequestedURL:   target.RequestedURL,
			NormalizedURL:  target.NormalizedURL,
			Origin:         target.Origin,
			FinalURL:       actionURL,
			FinalOrigin:    actionOrigin,
		}
	}

	target.FinalURL = finalURL
	target.FinalOrigin = finalOrigin
	target.ResolvedLabel = resolvedLabel
	target.ActionURL = actionURL
	target.ActionMethod = formMethod
	target.ControlFingerprint = strings.Join([]string{
		target.Selector,
		resolvedLabel,
		formMethod,
		actionURL,
	}, "|")
	target.Blocked = false
	target.Reason = "destructive browser control matched the bounded selector and requires operator approval before execution"
	return target, nil
}

func executeBrowserConnectorClickReal(ctx context.Context, target browserConnectorTarget, profile connectorProfileConfig) (browserConnectorClickResult, error) {
	client := &http.Client{
		Timeout:       10 * time.Second,
		CheckRedirect: browserConnectorRedirectPolicy(target, profile),
	}
	req, err := http.NewRequestWithContext(ctx, target.ActionMethod, target.ActionURL, nil)
	if err != nil {
		return browserConnectorClickResult{}, fmt.Errorf("build browser destructive click request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		var classified browserConnectorClassifiedError
		if errors.As(err, &classified) {
			return browserConnectorClickResult{}, classified
		}
		return browserConnectorClickResult{}, fmt.Errorf("execute browser destructive click: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, int64(connectorBrowserMetadataReadLimit+1)))
	if err != nil {
		return browserConnectorClickResult{}, fmt.Errorf("read browser destructive click response body: %w", err)
	}
	finalURL, finalOrigin, err := normalizeConnectorBrowserURL(resp.Request.URL.String())
	if err != nil {
		return browserConnectorClickResult{}, fmt.Errorf("normalize browser destructive click final url: %w", err)
	}
	if resp.StatusCode >= 400 {
		return browserConnectorClickResult{}, fmt.Errorf("browser destructive click returned status %d", resp.StatusCode)
	}
	return browserConnectorClickResult{
		FinalURL:    finalURL,
		FinalOrigin: finalOrigin,
		StatusCode:  resp.StatusCode,
		PageTitle:   extractBrowserHTMLTitle(body),
	}, nil
}

func browserConnectorButtonsBySelector(body []byte, selector string) []browserConnectorButtonMatch {
	normalizedSelector := strings.TrimSpace(selector)
	if !strings.HasPrefix(normalizedSelector, "#") || len(normalizedSelector) <= 1 {
		return nil
	}
	targetID := strings.TrimPrefix(normalizedSelector, "#")
	matches := connectorBrowserButtonPattern.FindAllSubmatch(body, -1)
	out := make([]browserConnectorButtonMatch, 0, len(matches))
	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		attributes := parseBrowserHTMLAttributes(string(match[1]))
		if strings.TrimSpace(attributes["id"]) != targetID {
			continue
		}
		out = append(out, browserConnectorButtonMatch{
			Attributes: attributes,
			InnerHTML:  string(match[2]),
		})
	}
	return out
}

func parseBrowserHTMLAttributes(raw string) map[string]string {
	out := map[string]string{}
	for _, match := range connectorBrowserAttrPattern.FindAllStringSubmatch(raw, -1) {
		if len(match) < 5 {
			continue
		}
		value := match[2]
		if value == "" {
			value = match[3]
		}
		if value == "" {
			value = match[4]
		}
		out[strings.ToLower(strings.TrimSpace(match[1]))] = html.UnescapeString(strings.TrimSpace(value))
	}
	return out
}

func browserConnectorLabelDestructive(label string) bool {
	normalized := strings.ToLower(collapseBrowserWhitespace(label))
	for _, keyword := range []string{"delete", "remove", "revoke", "disconnect", "archive", "destroy"} {
		if strings.Contains(normalized, keyword) {
			return true
		}
	}
	return false
}

func browserConnectorRedirectPolicy(target browserConnectorTarget, profile connectorProfileConfig) func(*http.Request, []*http.Request) error {
	return func(req *http.Request, _ []*http.Request) error {
		finalURL, finalOrigin, err := normalizeConnectorBrowserURL(req.URL.String())
		if err != nil {
			return browserConnectorClassifiedError{
				StatementClass: "unsupported_scheme",
				Reason:         "browser redirect target is not a supported http or https URL",
				RequestedURL:   target.RequestedURL,
				NormalizedURL:  target.NormalizedURL,
				Origin:         target.Origin,
				FinalURL:       finalURL,
				FinalOrigin:    finalOrigin,
			}
		}
		if !browserConnectorOriginAllowed(profile.AllowedOrigins, finalOrigin) {
			return browserConnectorClassifiedError{
				StatementClass: "redirect_out_of_scope",
				Reason:         "browser redirect target leaves the bounded browser connector allowlist",
				RequestedURL:   target.RequestedURL,
				NormalizedURL:  target.NormalizedURL,
				Origin:         target.Origin,
				FinalURL:       finalURL,
				FinalOrigin:    finalOrigin,
			}
		}
		return nil
	}
}

func normalizeBrowserContentType(raw string) string {
	value := strings.TrimSpace(raw)
	if idx := strings.Index(value, ";"); idx >= 0 {
		value = value[:idx]
	}
	return strings.TrimSpace(strings.ToLower(value))
}

func extractBrowserHTMLTitle(body []byte) string {
	match := connectorBrowserTitlePattern.FindSubmatch(body)
	if len(match) < 2 {
		return ""
	}
	return collapseBrowserWhitespace(html.UnescapeString(string(match[1])))
}

func extractBrowserHTMLText(body []byte) string {
	content := connectorBrowserScriptPattern.ReplaceAllString(string(body), " ")
	content = connectorBrowserStylePattern.ReplaceAllString(content, " ")
	content = connectorBrowserTagPattern.ReplaceAllString(content, " ")
	content = html.UnescapeString(content)
	return collapseBrowserWhitespace(content)
}

func collapseBrowserWhitespace(value string) string {
	return strings.TrimSpace(connectorBrowserWhitespacePattern.ReplaceAllString(value, " "))
}
