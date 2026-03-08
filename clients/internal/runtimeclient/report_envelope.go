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
	ExportProfile        string
	Audience             string
	RetentionClass       string
	OrgAdminProfileID    string
	OrganizationModel    string
	OrgAdminRoleBundle   string
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
	ApprovalCheckpoints  []runtimeapi.ApprovalCheckpointRecord
	Summary              string
	Details              []string
	Recent               []string
	ActionHints          []string
}

type EnterpriseReportEnvelope struct {
	Header                   string
	ReportType               string
	ExportProfile            string
	Audience                 string
	RetentionClass           string
	ClientSurface            string
	ContextLabel             string
	ContextValue             string
	SubjectLabel             string
	SubjectValue             string
	TaskID                   string
	TaskStatus               string
	SessionID                string
	SessionStatus            string
	WorkerID                 string
	WorkerType               string
	WorkerAdapterID          string
	WorkerState              string
	ExecutionMode            string
	OpenApprovals            int
	PendingProposalCount     int
	ToolActionCount          int
	EvidenceCount            int
	Summary                  string
	Details                  []string
	ApplicableOrgAdmins      []string
	ApplicablePolicyPacks    []string
	ExportProfileLabels      []string
	RoleBundles              []string
	AdminRoleBundles         []string
	DelegationModels         []string
	DelegatedAdminBundles    []string
	BreakGlassBundles        []string
	DecisionBindingLabels    []string
	EnforcementProfileLabels []string
	DirectorySyncMappings    []string
	ExceptionProfileLabels   []string
	OverlayProfileLabels     []string
	WorkerCapabilityLabels   []string
	DirectorySyncInputs      []string
	ResidencyProfiles        []string
	ResidencyExceptions      []string
	LegalHoldProfiles        []string
	LegalHoldExceptions      []string
	NetworkBoundaryProfiles  []string
	FleetRolloutProfiles     []string
	QuotaDimensions          []string
	QuotaOverlays            []string
	ChargebackDimensions     []string
	ChargebackOverlays       []string
	EnforcementHooks         []string
	BoundaryRequirements     []string
	DecisionSurfaces         []string
	ReportingSurfaces        []string
	AllowedAudiences         []string
	AllowedRetention         []string
	RetentionOverlays        []string
	DeliveryChannels         []string
	RedactionModes           []string
	Recent                   []string
	ActionHints              []string
	DLPFindings              []string
	RedactionCount           int
}

type EnterpriseReportDisposition struct {
	ExportProfile  string
	Audience       string
	RetentionClass string
}

var enterpriseReportSensitivePatterns = []*regexp.Regexp{
	regexp.MustCompile(`sk-[a-zA-Z0-9]{12,}`),
	regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
	regexp.MustCompile(`-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----`),
	regexp.MustCompile(`\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b`),
	regexp.MustCompile(`Bearer\s+[A-Za-z0-9._-]{20,}`),
}

func ResolveEnterpriseReportDisposition(clientSurface, reportType, exportProfile, audience string) EnterpriseReportDisposition {
	surface := strings.TrimSpace(clientSurface)
	report := strings.TrimSpace(reportType)
	disposition := EnterpriseReportDisposition{
		ExportProfile:  NormalizeStringOrDefault(exportProfile, defaultEnterpriseReportProfile(surface, report)),
		Audience:       NormalizeStringOrDefault(audience, defaultEnterpriseReportAudience(surface)),
		RetentionClass: defaultEnterpriseReportRetentionClass(report),
	}
	return disposition
}

func BuildEnterpriseReportEnvelope(subject EnterpriseReportSubject, policyCatalog *runtimeapi.PolicyPackCatalogResponse, capabilityCatalog *runtimeapi.WorkerCapabilityCatalogResponse, exportProfileCatalog *runtimeapi.ExportProfileCatalogResponse, orgAdminCatalog *runtimeapi.OrgAdminCatalogResponse) EnterpriseReportEnvelope {
	disposition := ResolveEnterpriseReportDisposition(subject.ClientSurface, subject.ReportType, subject.ExportProfile, subject.Audience)
	orgAdminReview := BuildOrgAdminReviewProjection(subject.ApprovalCheckpoints)
	effectiveProfileID := NormalizeStringOrDefault(subject.OrgAdminProfileID, orgAdminReview.ProfileID)
	effectiveOrganizationModel := NormalizeStringOrDefault(subject.OrganizationModel, orgAdminReview.OrganizationModel)
	effectiveRoleBundle := NormalizeStringOrDefault(subject.OrgAdminRoleBundle, orgAdminReview.RoleBundle)
	exportProfileItems := exportProfileItemsForSubject(exportProfileCatalog, subject, disposition)
	orgAdminItems := orgAdminCatalogItemsForSubject(orgAdminCatalog, EnterpriseReportSubject{
		OrgAdminProfileID:  effectiveProfileID,
		OrganizationModel:  effectiveOrganizationModel,
		OrgAdminRoleBundle: effectiveRoleBundle,
		ClientSurface:      subject.ClientSurface,
	})
	disposition.RetentionClass = resolveEnterpriseReportRetentionClass(subject.RetentionClass, disposition, exportProfileItems)
	envelope := EnterpriseReportEnvelope{
		Header:               NormalizeStringOrDefault(subject.Header, "AgentOps enterprise governance report"),
		ReportType:           NormalizeStringOrDefault(subject.ReportType, "report"),
		ExportProfile:        disposition.ExportProfile,
		Audience:             disposition.Audience,
		RetentionClass:       disposition.RetentionClass,
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
		Details:              append(append([]string(nil), subject.Details...), orgAdminReview.Details...),
		Recent:               append([]string(nil), subject.Recent...),
		ActionHints:          append(append([]string(nil), subject.ActionHints...), orgAdminReview.ActionHints...),
	}

	capabilityItems := capabilityCatalogItemsForSubject(capabilityCatalog, subject)
	policyItems := policyPackItemsForSubject(policyCatalog, subject)
	envelope.WorkerCapabilityLabels = renderCapabilityLabels(capabilityItems)
	envelope.ApplicableOrgAdmins = renderOrgAdminLabels(orgAdminItems)
	envelope.ApplicablePolicyPacks = renderPolicyPackLabels(policyItems)
	envelope.ExportProfileLabels = renderExportProfileLabels(exportProfileItems)
	envelope.RoleBundles = combineRoleBundles(policyItems)
	envelope.AdminRoleBundles = combineOrgAdminRoleBundles(orgAdminItems)
	envelope.DelegationModels = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return []string{item.DelegationModel} })
	envelope.DelegatedAdminBundles = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.DelegatedAdminRoleBundles })
	envelope.BreakGlassBundles = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.BreakGlassRoleBundles })
	envelope.DecisionBindingLabels = renderOrgAdminDecisionBindings(orgAdminItems)
	envelope.EnforcementProfileLabels = renderOrgAdminEnforcementProfiles(orgAdminItems)
	envelope.DirectorySyncMappings = renderOrgAdminDirectorySyncMappings(orgAdminItems)
	envelope.ExceptionProfileLabels = renderOrgAdminExceptionProfiles(orgAdminItems)
	envelope.OverlayProfileLabels = renderOrgAdminOverlayProfiles(orgAdminItems)
	envelope.BoundaryRequirements = combineBoundaryRequirements(capabilityItems, policyItems)
	envelope.DirectorySyncInputs = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.DirectorySyncInputs })
	envelope.ResidencyProfiles = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.ResidencyProfiles })
	envelope.ResidencyExceptions = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.ResidencyExceptionInputs })
	envelope.LegalHoldProfiles = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.LegalHoldProfiles })
	envelope.LegalHoldExceptions = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.LegalHoldExceptionInputs })
	envelope.NetworkBoundaryProfiles = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.NetworkBoundaryProfiles })
	envelope.FleetRolloutProfiles = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.FleetRolloutProfiles })
	envelope.QuotaDimensions = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.QuotaDimensions })
	envelope.QuotaOverlays = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.QuotaOverlayInputs })
	envelope.ChargebackDimensions = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.ChargebackDimensions })
	envelope.ChargebackOverlays = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.ChargebackOverlayInputs })
	envelope.EnforcementHooks = combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.EnforcementHooks })
	envelope.DecisionSurfaces = combineDecisionSurfaces(policyItems)
	envelope.ReportingSurfaces = sortedUniqueStrings(append(
		append(combineReportingSurfaces(policyItems), combineOrgAdminField(orgAdminItems, func(item runtimeapi.OrgAdminCatalogEntry) []string { return item.ReportingSurfaces })...),
		combineExportProfileDeliveryChannels(exportProfileItems)...,
	))
	if len(envelope.ReportingSurfaces) == 0 {
		envelope.ReportingSurfaces = []string{"report"}
	}
	envelope.AllowedAudiences = combineExportProfileAudiences(exportProfileItems)
	envelope.AllowedRetention = combineExportProfileRetentionClasses(exportProfileItems)
	envelope.RetentionOverlays = renderRetentionOverlayLabels(exportProfileItems)
	envelope.DeliveryChannels = combineExportProfileDeliveryChannels(exportProfileItems)
	envelope.RedactionModes = combineExportProfileRedactionModes(exportProfileItems)
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
	lines = append(lines, fmt.Sprintf("Export profile: %s", NormalizeStringOrDefault(env.ExportProfile, "operator_review")))
	lines = append(lines, fmt.Sprintf("Audience: %s", NormalizeStringOrDefault(env.Audience, "operator")))
	lines = append(lines, fmt.Sprintf("Retention class: %s", NormalizeStringOrDefault(env.RetentionClass, "standard")))
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
	appendEnvelopeSection(&lines, "Applicable org-admin profiles:", env.ApplicableOrgAdmins)
	appendEnvelopeSection(&lines, "Applicable policy packs:", env.ApplicablePolicyPacks)
	appendEnvelopeSection(&lines, "Export profile coverage:", env.ExportProfileLabels)
	appendEnvelopeSection(&lines, "Role bundles:", env.RoleBundles)
	appendEnvelopeSection(&lines, "Admin role bundles:", env.AdminRoleBundles)
	appendEnvelopeSection(&lines, "Delegation models:", env.DelegationModels)
	appendEnvelopeSection(&lines, "Delegated admin bundles:", env.DelegatedAdminBundles)
	appendEnvelopeSection(&lines, "Break-glass bundles:", env.BreakGlassBundles)
	appendEnvelopeSection(&lines, "Decision binding coverage:", env.DecisionBindingLabels)
	appendEnvelopeSection(&lines, "Enforcement profile coverage:", env.EnforcementProfileLabels)
	appendEnvelopeSection(&lines, "Directory-sync mapping coverage:", env.DirectorySyncMappings)
	appendEnvelopeSection(&lines, "Exception profile coverage:", env.ExceptionProfileLabels)
	appendEnvelopeSection(&lines, "Overlay profile coverage:", env.OverlayProfileLabels)
	appendEnvelopeSection(&lines, "Worker capability coverage:", env.WorkerCapabilityLabels)
	appendEnvelopeSection(&lines, "Directory-sync inputs:", env.DirectorySyncInputs)
	appendEnvelopeSection(&lines, "Residency profiles:", env.ResidencyProfiles)
	appendEnvelopeSection(&lines, "Residency exception inputs:", env.ResidencyExceptions)
	appendEnvelopeSection(&lines, "Legal-hold profiles:", env.LegalHoldProfiles)
	appendEnvelopeSection(&lines, "Legal-hold exception inputs:", env.LegalHoldExceptions)
	appendEnvelopeSection(&lines, "Network boundary profiles:", env.NetworkBoundaryProfiles)
	appendEnvelopeSection(&lines, "Fleet rollout profiles:", env.FleetRolloutProfiles)
	appendEnvelopeSection(&lines, "Quota dimensions:", env.QuotaDimensions)
	appendEnvelopeSection(&lines, "Quota overlay inputs:", env.QuotaOverlays)
	appendEnvelopeSection(&lines, "Chargeback dimensions:", env.ChargebackDimensions)
	appendEnvelopeSection(&lines, "Chargeback overlay inputs:", env.ChargebackOverlays)
	appendEnvelopeSection(&lines, "Enforcement hooks:", env.EnforcementHooks)
	appendEnvelopeSection(&lines, "Boundary requirements:", env.BoundaryRequirements)
	appendEnvelopeSection(&lines, "Decision surfaces:", env.DecisionSurfaces)
	appendEnvelopeSection(&lines, "Reporting surfaces:", env.ReportingSurfaces)
	appendEnvelopeSection(&lines, "Allowed audiences:", env.AllowedAudiences)
	appendEnvelopeSection(&lines, "Allowed retention classes:", env.AllowedRetention)
	appendEnvelopeSection(&lines, "Retention overlays:", env.RetentionOverlays)
	appendEnvelopeSection(&lines, "Delivery channels:", env.DeliveryChannels)
	appendEnvelopeSection(&lines, "Redaction modes:", env.RedactionModes)
	appendEnvelopeSection(&lines, "DLP findings:", env.DLPFindings)
	appendEnvelopeSection(&lines, "Recent activity:", env.Recent)
	appendEnvelopeSection(&lines, "Action hints:", env.ActionHints)
	return strings.Join(lines, "\n") + "\n"
}

func defaultEnterpriseReportProfile(clientSurface, reportType string) string {
	surface := strings.ToLower(strings.TrimSpace(clientSurface))
	report := strings.ToLower(strings.TrimSpace(reportType))
	switch surface {
	case "workflow":
		if strings.Contains(report, "delta") || strings.Contains(report, "follow") {
			return "workflow_follow"
		}
		return "workflow_review"
	case "chatops":
		if strings.Contains(report, "delta") || strings.Contains(report, "follow") {
			return "conversation_follow"
		}
		return "conversation_review"
	default:
		if strings.Contains(report, "delta") || strings.Contains(report, "follow") {
			return "operator_follow"
		}
		return "operator_review"
	}
}

func defaultEnterpriseReportAudience(clientSurface string) string {
	switch strings.ToLower(strings.TrimSpace(clientSurface)) {
	case "workflow":
		return "workflow_operator"
	case "chatops":
		return "conversation_operator"
	default:
		return "operator"
	}
}

func defaultEnterpriseReportRetentionClass(reportType string) string {
	report := strings.ToLower(strings.TrimSpace(reportType))
	switch {
	case strings.Contains(report, "export"):
		return "archive"
	case strings.Contains(report, "delta"), strings.Contains(report, "follow"), strings.Contains(report, "handoff"):
		return "short"
	default:
		return "standard"
	}
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

func orgAdminCatalogItemsForSubject(catalog *runtimeapi.OrgAdminCatalogResponse, subject EnterpriseReportSubject) []runtimeapi.OrgAdminCatalogEntry {
	if catalog == nil {
		return nil
	}
	filtered := make([]runtimeapi.OrgAdminCatalogEntry, 0, len(catalog.Items))
	for _, item := range catalog.Items {
		if profileID := strings.TrimSpace(subject.OrgAdminProfileID); profileID != "" && !strings.EqualFold(item.ProfileID, profileID) {
			continue
		}
		if organizationModel := strings.TrimSpace(subject.OrganizationModel); organizationModel != "" && !strings.EqualFold(item.OrganizationModel, organizationModel) {
			continue
		}
		if roleBundle := strings.TrimSpace(subject.OrgAdminRoleBundle); roleBundle != "" {
			allBundles := append(append([]string(nil), item.AdminRoleBundles...), item.DelegatedAdminRoleBundles...)
			allBundles = append(allBundles, item.BreakGlassRoleBundles...)
			if !selectorContainsFold(allBundles, roleBundle) {
				continue
			}
		}
		if surface := strings.TrimSpace(subject.ClientSurface); surface != "" && len(item.ClientSurfaces) > 0 && !selectorContainsFold(item.ClientSurfaces, surface) {
			continue
		}
		filtered = append(filtered, item)
	}
	if len(filtered) > 0 {
		return filtered
	}
	return append([]runtimeapi.OrgAdminCatalogEntry(nil), catalog.Items...)
}

func exportProfileItemsForSubject(catalog *runtimeapi.ExportProfileCatalogResponse, subject EnterpriseReportSubject, disposition EnterpriseReportDisposition) []runtimeapi.ExportProfileCatalogEntry {
	if catalog == nil {
		return nil
	}
	filtered := make([]runtimeapi.ExportProfileCatalogEntry, 0, len(catalog.Items))
	for _, item := range catalog.Items {
		if disposition.ExportProfile != "" && !strings.EqualFold(item.ExportProfile, disposition.ExportProfile) {
			continue
		}
		if surface := strings.TrimSpace(subject.ClientSurface); surface != "" && len(item.ClientSurfaces) > 0 && !selectorContainsFold(item.ClientSurfaces, surface) {
			continue
		}
		if reportType := strings.TrimSpace(subject.ReportType); reportType != "" && len(item.ReportTypes) > 0 && !selectorContainsFold(item.ReportTypes, reportType) {
			continue
		}
		if audience := strings.TrimSpace(disposition.Audience); audience != "" {
			allowedAudiences := append([]string(nil), item.AllowedAudiences...)
			if item.DefaultAudience != "" {
				allowedAudiences = append(allowedAudiences, item.DefaultAudience)
			}
			if len(allowedAudiences) > 0 && !selectorContainsFold(allowedAudiences, audience) {
				continue
			}
		}
		filtered = append(filtered, item)
	}
	if len(filtered) > 0 {
		return filtered
	}
	return append([]runtimeapi.ExportProfileCatalogEntry(nil), catalog.Items...)
}

func resolveEnterpriseReportRetentionClass(explicit string, disposition EnterpriseReportDisposition, items []runtimeapi.ExportProfileCatalogEntry) string {
	if trimmed := strings.TrimSpace(explicit); trimmed != "" {
		return trimmed
	}
	audience := strings.TrimSpace(disposition.Audience)
	for _, item := range items {
		for candidateAudience, candidateRetention := range item.AudienceRetentionClassOverlays {
			if strings.EqualFold(strings.TrimSpace(candidateAudience), audience) && strings.TrimSpace(candidateRetention) != "" {
				return strings.TrimSpace(candidateRetention)
			}
		}
	}
	for _, item := range items {
		if strings.TrimSpace(item.DefaultRetentionClass) != "" {
			return strings.TrimSpace(item.DefaultRetentionClass)
		}
	}
	if strings.TrimSpace(disposition.RetentionClass) != "" {
		return strings.TrimSpace(disposition.RetentionClass)
	}
	return "standard"
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

func renderExportProfileLabels(items []runtimeapi.ExportProfileCatalogEntry) []string {
	lines := make([]string, 0, len(items))
	for _, item := range items {
		label := NormalizeStringOrDefault(item.Label, item.ExportProfile)
		if strings.TrimSpace(item.ExportProfile) != "" {
			label = fmt.Sprintf("%s (%s)", label, item.ExportProfile)
		}
		lines = append(lines, label)
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

func renderOrgAdminLabels(items []runtimeapi.OrgAdminCatalogEntry) []string {
	lines := make([]string, 0, len(items))
	for _, item := range items {
		label := NormalizeStringOrDefault(item.Label, item.ProfileID)
		if strings.TrimSpace(item.ProfileID) != "" {
			label = fmt.Sprintf("%s (%s)", label, item.ProfileID)
		}
		lines = append(lines, label)
	}
	return lines
}

func renderOrgAdminEnforcementProfiles(items []runtimeapi.OrgAdminCatalogEntry) []string {
	lines := make([]string, 0)
	for _, item := range items {
		for _, profile := range item.EnforcementProfiles {
			parts := []string{NormalizeStringOrDefault(profile.Label, profile.HookID)}
			if category := strings.TrimSpace(profile.Category); category != "" {
				parts = append(parts, fmt.Sprintf("category=%s", category))
			}
			if mode := strings.TrimSpace(profile.EnforcementMode); mode != "" {
				parts = append(parts, fmt.Sprintf("mode=%s", mode))
			}
			if len(profile.RoleBundles) > 0 {
				parts = append(parts, fmt.Sprintf("roles=%s", strings.Join(profile.RoleBundles, ",")))
			}
			if len(profile.RequiredInputs) > 0 {
				parts = append(parts, fmt.Sprintf("inputs=%s", strings.Join(profile.RequiredInputs, ",")))
			}
			lines = append(lines, strings.Join(parts, " | "))
		}
	}
	return sortedUniqueStrings(lines)
}

func renderOrgAdminDecisionBindings(items []runtimeapi.OrgAdminCatalogEntry) []string {
	lines := make([]string, 0)
	for _, item := range items {
		for _, binding := range item.DecisionBindings {
			parts := []string{NormalizeStringOrDefault(binding.Label, binding.BindingID)}
			if category := strings.TrimSpace(binding.Category); category != "" {
				parts = append(parts, fmt.Sprintf("category=%s", category))
			}
			if mode := strings.TrimSpace(binding.BindingMode); mode != "" {
				parts = append(parts, fmt.Sprintf("mode=%s", mode))
			}
			if len(binding.HookIDs) > 0 {
				parts = append(parts, fmt.Sprintf("hooks=%s", strings.Join(binding.HookIDs, ",")))
			}
			if len(binding.DirectorySyncMappings) > 0 {
				parts = append(parts, fmt.Sprintf("mappings=%s", strings.Join(binding.DirectorySyncMappings, ",")))
			}
			if len(binding.ExceptionProfiles) > 0 {
				parts = append(parts, fmt.Sprintf("exceptions=%s", strings.Join(binding.ExceptionProfiles, ",")))
			}
			if len(binding.OverlayProfiles) > 0 {
				parts = append(parts, fmt.Sprintf("overlays=%s", strings.Join(binding.OverlayProfiles, ",")))
			}
			if len(binding.RequiredInputs) > 0 {
				parts = append(parts, fmt.Sprintf("inputs=%s", strings.Join(binding.RequiredInputs, ",")))
			}
			lines = append(lines, strings.Join(parts, " | "))
		}
	}
	return sortedUniqueStrings(lines)
}

func renderOrgAdminDirectorySyncMappings(items []runtimeapi.OrgAdminCatalogEntry) []string {
	lines := make([]string, 0)
	for _, item := range items {
		for _, mapping := range item.DirectorySyncMappings {
			parts := []string{NormalizeStringOrDefault(mapping.Label, mapping.MappingID)}
			if mode := strings.TrimSpace(mapping.MappingMode); mode != "" {
				parts = append(parts, fmt.Sprintf("mode=%s", mode))
			}
			if len(mapping.ScopeDimensions) > 0 {
				parts = append(parts, fmt.Sprintf("scope=%s", strings.Join(mapping.ScopeDimensions, ",")))
			}
			if len(mapping.RequiredInputs) > 0 {
				parts = append(parts, fmt.Sprintf("inputs=%s", strings.Join(mapping.RequiredInputs, ",")))
			}
			lines = append(lines, strings.Join(parts, " | "))
		}
	}
	return sortedUniqueStrings(lines)
}

func renderOrgAdminExceptionProfiles(items []runtimeapi.OrgAdminCatalogEntry) []string {
	lines := make([]string, 0)
	for _, item := range items {
		for _, profile := range item.ExceptionProfiles {
			parts := []string{NormalizeStringOrDefault(profile.Label, profile.ProfileID)}
			if category := strings.TrimSpace(profile.Category); category != "" {
				parts = append(parts, fmt.Sprintf("category=%s", category))
			}
			if mode := strings.TrimSpace(profile.ExceptionMode); mode != "" {
				parts = append(parts, fmt.Sprintf("mode=%s", mode))
			}
			if len(profile.RequiredInputs) > 0 {
				parts = append(parts, fmt.Sprintf("inputs=%s", strings.Join(profile.RequiredInputs, ",")))
			}
			lines = append(lines, strings.Join(parts, " | "))
		}
	}
	return sortedUniqueStrings(lines)
}

func renderOrgAdminOverlayProfiles(items []runtimeapi.OrgAdminCatalogEntry) []string {
	lines := make([]string, 0)
	for _, item := range items {
		for _, profile := range item.OverlayProfiles {
			parts := []string{NormalizeStringOrDefault(profile.Label, profile.OverlayID)}
			if category := strings.TrimSpace(profile.Category); category != "" {
				parts = append(parts, fmt.Sprintf("category=%s", category))
			}
			if mode := strings.TrimSpace(profile.OverlayMode); mode != "" {
				parts = append(parts, fmt.Sprintf("mode=%s", mode))
			}
			if len(profile.TargetDimensions) > 0 {
				parts = append(parts, fmt.Sprintf("dimensions=%s", strings.Join(profile.TargetDimensions, ",")))
			}
			if len(profile.RequiredInputs) > 0 {
				parts = append(parts, fmt.Sprintf("inputs=%s", strings.Join(profile.RequiredInputs, ",")))
			}
			lines = append(lines, strings.Join(parts, " | "))
		}
	}
	return sortedUniqueStrings(lines)
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

func combineOrgAdminRoleBundles(items []runtimeapi.OrgAdminCatalogEntry) []string {
	values := make([]string, 0)
	for _, item := range items {
		values = append(values, item.AdminRoleBundles...)
	}
	return sortedUniqueStrings(values)
}

func combineOrgAdminField(items []runtimeapi.OrgAdminCatalogEntry, extractor func(runtimeapi.OrgAdminCatalogEntry) []string) []string {
	values := make([]string, 0)
	for _, item := range items {
		values = append(values, extractor(item)...)
	}
	return sortedUniqueStrings(values)
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

func combineExportProfileAudiences(items []runtimeapi.ExportProfileCatalogEntry) []string {
	values := make([]string, 0)
	for _, item := range items {
		values = append(values, item.DefaultAudience)
		values = append(values, item.AllowedAudiences...)
	}
	return sortedUniqueStrings(values)
}

func combineExportProfileRetentionClasses(items []runtimeapi.ExportProfileCatalogEntry) []string {
	values := make([]string, 0)
	for _, item := range items {
		values = append(values, item.DefaultRetentionClass)
		values = append(values, item.AllowedRetentionClasses...)
		for _, overlay := range item.AudienceRetentionClassOverlays {
			values = append(values, overlay)
		}
	}
	return sortedUniqueStrings(values)
}

func renderRetentionOverlayLabels(items []runtimeapi.ExportProfileCatalogEntry) []string {
	values := make([]string, 0)
	for _, item := range items {
		for audience, retentionClass := range item.AudienceRetentionClassOverlays {
			audience = strings.TrimSpace(audience)
			retentionClass = strings.TrimSpace(retentionClass)
			if audience == "" || retentionClass == "" {
				continue
			}
			values = append(values, fmt.Sprintf("%s => %s", audience, retentionClass))
		}
	}
	return sortedUniqueStrings(values)
}

func combineExportProfileDeliveryChannels(items []runtimeapi.ExportProfileCatalogEntry) []string {
	values := make([]string, 0)
	for _, item := range items {
		values = append(values, item.DeliveryChannels...)
	}
	return sortedUniqueStrings(values)
}

func combineExportProfileRedactionModes(items []runtimeapi.ExportProfileCatalogEntry) []string {
	values := make([]string, 0)
	for _, item := range items {
		values = append(values, item.RedactionMode)
	}
	return sortedUniqueStrings(values)
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
