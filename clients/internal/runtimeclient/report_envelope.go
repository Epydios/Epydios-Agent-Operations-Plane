package runtimeclient

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type EnterpriseReportSubject struct {
	Header               string
	ReportType           string
	ClientSurface        string
	ContextLabel         string
	ContextValue         string
	SubjectLabel         string
	SubjectValue         string
	TaskID               string
	TaskStatus           string
	SessionID            string
	SessionStatus        string
	WorkerID             string
	WorkerType           string
	WorkerAdapterID      string
	WorkerState          string
	ExecutionMode        string
	OpenApprovals        int
	PendingProposalCount int
	ToolActionCount      int
	EvidenceCount        int
	Summary              string
	Details              []string
	Recent               []string
	ActionHints          []string
}

type EnterpriseReportEnvelope struct {
	Header                 string
	ReportType             string
	ClientSurface          string
	ContextLabel           string
	ContextValue           string
	SubjectLabel           string
	SubjectValue           string
	TaskID                 string
	TaskStatus             string
	SessionID              string
	SessionStatus          string
	WorkerID               string
	WorkerType             string
	WorkerAdapterID        string
	WorkerState            string
	ExecutionMode          string
	OpenApprovals          int
	PendingProposalCount   int
	ToolActionCount        int
	EvidenceCount          int
	Summary                string
	Details                []string
	ApplicablePolicyPacks  []string
	RoleBundles            []string
	WorkerCapabilityLabels []string
	BoundaryRequirements   []string
	DecisionSurfaces       []string
	ReportingSurfaces      []string
	Recent                 []string
	ActionHints            []string
	DLPFindings            []string
	RedactionCount         int
}

var enterpriseReportSensitivePatterns = []*regexp.Regexp{
	regexp.MustCompile(`sk-[a-zA-Z0-9]{12,}`),
	regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
	regexp.MustCompile(`-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----`),
	regexp.MustCompile(`\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b`),
	regexp.MustCompile(`Bearer\s+[A-Za-z0-9._-]{20,}`),
}

func BuildEnterpriseReportEnvelope(subject EnterpriseReportSubject, policyCatalog *runtimeapi.PolicyPackCatalogResponse, capabilityCatalog *runtimeapi.WorkerCapabilityCatalogResponse) EnterpriseReportEnvelope {
	envelope := EnterpriseReportEnvelope{
		Header:               NormalizeStringOrDefault(subject.Header, "AgentOps enterprise governance report"),
		ReportType:           NormalizeStringOrDefault(subject.ReportType, "report"),
		ClientSurface:        strings.TrimSpace(subject.ClientSurface),
		ContextLabel:         NormalizeStringOrDefault(subject.ContextLabel, "Context"),
		ContextValue:         strings.TrimSpace(subject.ContextValue),
		SubjectLabel:         NormalizeStringOrDefault(subject.SubjectLabel, "Subject"),
		SubjectValue:         strings.TrimSpace(subject.SubjectValue),
		TaskID:               strings.TrimSpace(subject.TaskID),
		TaskStatus:           strings.TrimSpace(subject.TaskStatus),
		SessionID:            strings.TrimSpace(subject.SessionID),
		SessionStatus:        strings.TrimSpace(subject.SessionStatus),
		WorkerID:             strings.TrimSpace(subject.WorkerID),
		WorkerType:           strings.TrimSpace(subject.WorkerType),
		WorkerAdapterID:      strings.TrimSpace(subject.WorkerAdapterID),
		WorkerState:          strings.TrimSpace(subject.WorkerState),
		ExecutionMode:        strings.TrimSpace(subject.ExecutionMode),
		OpenApprovals:        subject.OpenApprovals,
		PendingProposalCount: subject.PendingProposalCount,
		ToolActionCount:      subject.ToolActionCount,
		EvidenceCount:        subject.EvidenceCount,
		Summary:              strings.TrimSpace(subject.Summary),
		Details:              append([]string(nil), subject.Details...),
		Recent:               append([]string(nil), subject.Recent...),
		ActionHints:          append([]string(nil), subject.ActionHints...),
	}

	capabilityItems := capabilityCatalogItemsForSubject(capabilityCatalog, subject)
	policyItems := policyPackItemsForSubject(policyCatalog, subject)
	envelope.WorkerCapabilityLabels = renderCapabilityLabels(capabilityItems)
	envelope.ApplicablePolicyPacks = renderPolicyPackLabels(policyItems)
	envelope.RoleBundles = combineRoleBundles(policyItems)
	envelope.BoundaryRequirements = combineBoundaryRequirements(capabilityItems, policyItems)
	envelope.DecisionSurfaces = combineDecisionSurfaces(policyItems)
	envelope.ReportingSurfaces = combineReportingSurfaces(policyItems)
	if len(envelope.ReportingSurfaces) == 0 {
		envelope.ReportingSurfaces = []string{"report"}
	}
	envelope.ContextValue, envelope.RedactionCount = redactSensitiveReportText(envelope.ContextValue)
	envelope.SubjectValue, envelope.RedactionCount = redactSensitiveReportTextWithCount(envelope.SubjectValue, envelope.RedactionCount)
	envelope.Summary, envelope.RedactionCount = redactSensitiveReportTextWithCount(envelope.Summary, envelope.RedactionCount)
	envelope.Details, envelope.RedactionCount = redactSensitiveReportLinesWithCount(envelope.Details, envelope.RedactionCount)
	envelope.Recent, envelope.RedactionCount = redactSensitiveReportLinesWithCount(envelope.Recent, envelope.RedactionCount)
	envelope.ActionHints, envelope.RedactionCount = redactSensitiveReportLinesWithCount(envelope.ActionHints, envelope.RedactionCount)
	if envelope.RedactionCount > 0 {
		envelope.DLPFindings = append(envelope.DLPFindings,
			fmt.Sprintf("Secret-like material was redacted from governed report content before output. matches=%d", envelope.RedactionCount),
		)
	}
	return envelope
}

func RenderEnterpriseReportEnvelope(env EnterpriseReportEnvelope) string {
	lines := []string{NormalizeStringOrDefault(env.Header, "AgentOps enterprise governance report")}
	lines = append(lines, fmt.Sprintf("Type: %s", NormalizeStringOrDefault(env.ReportType, "report")))
	if surface := strings.TrimSpace(env.ClientSurface); surface != "" {
		lines = append(lines, fmt.Sprintf("Surface: %s", surface))
	}
	if value := strings.TrimSpace(env.ContextValue); value != "" {
		lines = append(lines, fmt.Sprintf("%s: %s", NormalizeStringOrDefault(env.ContextLabel, "Context"), value))
	}
	if value := strings.TrimSpace(env.SubjectValue); value != "" {
		lines = append(lines, fmt.Sprintf("%s: %s", NormalizeStringOrDefault(env.SubjectLabel, "Subject"), value))
	}
	if strings.TrimSpace(env.TaskID) != "" || strings.TrimSpace(env.TaskStatus) != "" {
		lines = append(lines, fmt.Sprintf("Task: %s (%s)", NormalizeStringOrDefault(env.TaskID, "-"), NormalizeStringOrDefault(env.TaskStatus, "-")))
	}
	if strings.TrimSpace(env.SessionID) != "" || strings.TrimSpace(env.SessionStatus) != "" {
		lines = append(lines, fmt.Sprintf("Session: %s (%s)", NormalizeStringOrDefault(env.SessionID, "-"), NormalizeStringOrDefault(env.SessionStatus, "-")))
	}
	if strings.TrimSpace(env.WorkerID) != "" || strings.TrimSpace(env.WorkerType) != "" || strings.TrimSpace(env.WorkerState) != "" || strings.TrimSpace(env.WorkerAdapterID) != "" {
		lines = append(lines, fmt.Sprintf("Worker: %s %s %s %s", NormalizeStringOrDefault(env.WorkerID, "-"), NormalizeStringOrDefault(env.WorkerType, "-"), NormalizeStringOrDefault(env.WorkerAdapterID, "-"), NormalizeStringOrDefault(env.WorkerState, "-")))
	}
	if executionMode := strings.TrimSpace(env.ExecutionMode); executionMode != "" {
		lines = append(lines, fmt.Sprintf("Execution mode: %s", executionMode))
	}
	lines = append(lines, fmt.Sprintf("Open approvals: %d", env.OpenApprovals))
	lines = append(lines, fmt.Sprintf("Pending proposals: %d", env.PendingProposalCount))
	lines = append(lines, fmt.Sprintf("Tool actions: %d", env.ToolActionCount))
	lines = append(lines, fmt.Sprintf("Evidence records: %d", env.EvidenceCount))
	if summary := strings.TrimSpace(env.Summary); summary != "" {
		lines = append(lines, fmt.Sprintf("Summary: %s", summary))
	}
	appendEnvelopeSection(&lines, "Details:", env.Details)
	appendEnvelopeSection(&lines, "Applicable policy packs:", env.ApplicablePolicyPacks)
	appendEnvelopeSection(&lines, "Role bundles:", env.RoleBundles)
	appendEnvelopeSection(&lines, "Worker capability coverage:", env.WorkerCapabilityLabels)
	appendEnvelopeSection(&lines, "Boundary requirements:", env.BoundaryRequirements)
	appendEnvelopeSection(&lines, "Decision surfaces:", env.DecisionSurfaces)
	appendEnvelopeSection(&lines, "Reporting surfaces:", env.ReportingSurfaces)
	appendEnvelopeSection(&lines, "DLP findings:", env.DLPFindings)
	appendEnvelopeSection(&lines, "Recent activity:", env.Recent)
	appendEnvelopeSection(&lines, "Action hints:", env.ActionHints)
	return strings.Join(lines, "\n") + "\n"
}

func ExecutionModeForWorker(workerType, adapterID string) string {
	workerType = strings.TrimSpace(workerType)
	adapterID = strings.TrimSpace(adapterID)
	switch {
	case strings.EqualFold(workerType, "managed_agent") && strings.EqualFold(adapterID, "codex"):
		return runtimeapi.AgentInvokeExecutionModeManagedCodexWorker
	case strings.EqualFold(workerType, "model_invoke"):
		return runtimeapi.AgentInvokeExecutionModeRawModelInvoke
	default:
		return ""
	}
}

func capabilityCatalogItemsForSubject(catalog *runtimeapi.WorkerCapabilityCatalogResponse, subject EnterpriseReportSubject) []runtimeapi.WorkerCapabilityCatalogEntry {
	if catalog == nil {
		return nil
	}
	filtered := make([]runtimeapi.WorkerCapabilityCatalogEntry, 0, len(catalog.Items))
	for _, item := range catalog.Items {
		if subject.ExecutionMode != "" && !strings.EqualFold(item.ExecutionMode, subject.ExecutionMode) {
			continue
		}
		if subject.WorkerType != "" && !strings.EqualFold(item.WorkerType, subject.WorkerType) {
			continue
		}
		if subject.WorkerAdapterID != "" && !strings.EqualFold(item.AdapterID, subject.WorkerAdapterID) {
			continue
		}
		filtered = append(filtered, item)
	}
	if len(filtered) > 0 {
		return filtered
	}
	if subject.ExecutionMode != "" || subject.WorkerType != "" || subject.WorkerAdapterID != "" {
		return nil
	}
	return append([]runtimeapi.WorkerCapabilityCatalogEntry(nil), catalog.Items...)
}

func policyPackItemsForSubject(catalog *runtimeapi.PolicyPackCatalogResponse, subject EnterpriseReportSubject) []runtimeapi.PolicyPackCatalogEntry {
	if catalog == nil {
		return nil
	}
	filtered := make([]runtimeapi.PolicyPackCatalogEntry, 0, len(catalog.Items))
	for _, item := range catalog.Items {
		if surface := strings.TrimSpace(subject.ClientSurface); surface != "" && len(item.ClientSurfaces) > 0 && !selectorContainsFold(item.ClientSurfaces, surface) {
			continue
		}
		if mode := strings.TrimSpace(subject.ExecutionMode); mode != "" && len(item.ApplicableExecutionModes) > 0 && !selectorContainsFold(item.ApplicableExecutionModes, mode) {
			continue
		}
		if workerType := strings.TrimSpace(subject.WorkerType); workerType != "" && len(item.ApplicableWorkerTypes) > 0 && !selectorContainsFold(item.ApplicableWorkerTypes, workerType) {
			continue
		}
		if adapterID := strings.TrimSpace(subject.WorkerAdapterID); adapterID != "" && len(item.ApplicableAdapterIDs) > 0 && !selectorContainsFold(item.ApplicableAdapterIDs, adapterID) {
			continue
		}
		filtered = append(filtered, item)
	}
	if len(filtered) > 0 {
		return filtered
	}
	fallback := make([]runtimeapi.PolicyPackCatalogEntry, 0, len(catalog.Items))
	for _, item := range catalog.Items {
		if strings.EqualFold(item.PackID, "read_only_review") {
			fallback = append(fallback, item)
		}
	}
	if len(fallback) > 0 {
		return fallback
	}
	return append([]runtimeapi.PolicyPackCatalogEntry(nil), catalog.Items...)
}

func renderCapabilityLabels(items []runtimeapi.WorkerCapabilityCatalogEntry) []string {
	lines := make([]string, 0, len(items))
	for _, item := range items {
		parts := []string{NormalizeStringOrDefault(item.Label, item.AdapterID)}
		if mode := strings.TrimSpace(item.ExecutionMode); mode != "" {
			parts = append(parts, mode)
		}
		if provider := strings.TrimSpace(item.Provider); provider != "" {
			parts = append(parts, provider)
		}
		lines = append(lines, strings.Join(parts, " | "))
	}
	return lines
}

func renderPolicyPackLabels(items []runtimeapi.PolicyPackCatalogEntry) []string {
	lines := make([]string, 0, len(items))
	for _, item := range items {
		label := NormalizeStringOrDefault(item.Label, item.PackID)
		if strings.TrimSpace(item.PackID) != "" {
			label = fmt.Sprintf("%s (%s)", label, item.PackID)
		}
		lines = append(lines, label)
	}
	return lines
}

func combineBoundaryRequirements(capabilities []runtimeapi.WorkerCapabilityCatalogEntry, policies []runtimeapi.PolicyPackCatalogEntry) []string {
	items := make([]string, 0)
	for _, item := range capabilities {
		items = append(items, item.BoundaryRequirements...)
	}
	for _, item := range policies {
		items = append(items, item.BoundaryRequirements...)
	}
	return sortedUniqueStrings(items)
}

func combineRoleBundles(policies []runtimeapi.PolicyPackCatalogEntry) []string {
	items := make([]string, 0)
	for _, item := range policies {
		items = append(items, item.RoleBundles...)
	}
	return sortedUniqueStrings(items)
}

func combineDecisionSurfaces(policies []runtimeapi.PolicyPackCatalogEntry) []string {
	items := make([]string, 0)
	for _, item := range policies {
		items = append(items, item.DecisionSurfaces...)
	}
	return sortedUniqueStrings(items)
}

func combineReportingSurfaces(policies []runtimeapi.PolicyPackCatalogEntry) []string {
	items := make([]string, 0)
	for _, item := range policies {
		items = append(items, item.ReportingSurfaces...)
	}
	return sortedUniqueStrings(items)
}

func sortedUniqueStrings(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	sort.Strings(out)
	return out
}

func redactSensitiveReportLinesWithCount(lines []string, base int) ([]string, int) {
	out := make([]string, 0, len(lines))
	count := base
	for _, line := range lines {
		redacted, hits := redactSensitiveReportText(line)
		count += hits
		out = append(out, redacted)
	}
	return out, count
}

func redactSensitiveReportTextWithCount(value string, base int) (string, int) {
	redacted, hits := redactSensitiveReportText(value)
	return redacted, base + hits
}

func redactSensitiveReportText(value string) (string, int) {
	redacted := value
	matches := 0
	for _, pattern := range enterpriseReportSensitivePatterns {
		indices := pattern.FindAllStringIndex(redacted, -1)
		if len(indices) == 0 {
			continue
		}
		matches += len(indices)
		redacted = pattern.ReplaceAllString(redacted, "[REDACTED_SECRET]")
	}
	return redacted, matches
}

func selectorContainsFold(items []string, target string) bool {
	target = strings.TrimSpace(target)
	for _, item := range items {
		if strings.EqualFold(strings.TrimSpace(item), target) {
			return true
		}
	}
	return false
}
