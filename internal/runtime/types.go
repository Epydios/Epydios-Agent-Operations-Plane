package runtime

import (
	"encoding/json"
	"time"
)

type JSONObject map[string]interface{}

type RunStatus string

const (
	RunStatusPending          RunStatus = "PENDING"
	RunStatusProfileResolved  RunStatus = "PROFILE_RESOLVED"
	RunStatusPolicyEvaluated  RunStatus = "POLICY_EVALUATED"
	RunStatusDesktopVerified  RunStatus = "DESKTOP_VERIFIED"
	RunStatusEvidenceRecorded RunStatus = "EVIDENCE_RECORDED"
	RunStatusCompleted        RunStatus = "COMPLETED"
	RunStatusFailed           RunStatus = "FAILED"
)

type ObjectMeta struct {
	RequestID   string     `json:"requestId"`
	Timestamp   *time.Time `json:"timestamp,omitempty"`
	TenantID    string     `json:"tenantId,omitempty"`
	ProjectID   string     `json:"projectId,omitempty"`
	Environment string     `json:"environment,omitempty"`
	Actor       JSONObject `json:"actor,omitempty"`
}

type RunCreateRequest struct {
	Meta           ObjectMeta               `json:"meta"`
	Subject        JSONObject               `json:"subject"`
	Action         JSONObject               `json:"action"`
	Resource       JSONObject               `json:"resource,omitempty"`
	Task           JSONObject               `json:"task,omitempty"`
	Defaults       JSONObject               `json:"defaults,omitempty"`
	Context        JSONObject               `json:"context,omitempty"`
	Mode           string                   `json:"mode,omitempty"`
	DryRun         bool                     `json:"dryRun,omitempty"`
	RetentionClass string                   `json:"retentionClass,omitempty"`
	Profile        JSONObject               `json:"profile,omitempty"`
	Workload       JSONObject               `json:"workload,omitempty"`
	Annotations    JSONObject               `json:"annotations,omitempty"`
	Desktop        *DesktopExecutionRequest `json:"desktop,omitempty"`
}

type RunRecord struct {
	RunID                    string          `json:"runId"`
	RequestID                string          `json:"requestId"`
	TenantID                 string          `json:"tenantId,omitempty"`
	ProjectID                string          `json:"projectId,omitempty"`
	Environment              string          `json:"environment,omitempty"`
	RetentionClass           string          `json:"retentionClass,omitempty"`
	ExpiresAt                *time.Time      `json:"expiresAt,omitempty"`
	Status                   RunStatus       `json:"status"`
	SelectedProfileProvider  string          `json:"selectedProfileProvider,omitempty"`
	SelectedPolicyProvider   string          `json:"selectedPolicyProvider,omitempty"`
	SelectedEvidenceProvider string          `json:"selectedEvidenceProvider,omitempty"`
	SelectedDesktopProvider  string          `json:"selectedDesktopProvider,omitempty"`
	PolicyDecision           string          `json:"policyDecision,omitempty"`
	PolicyBundleID           string          `json:"policyBundleId,omitempty"`
	PolicyBundleVersion      string          `json:"policyBundleVersion,omitempty"`
	PolicyGrantTokenPresent  bool            `json:"policyGrantTokenPresent,omitempty"`
	PolicyGrantTokenSHA256   string          `json:"policyGrantTokenSha256,omitempty"`
	RequestPayload           json.RawMessage `json:"requestPayload,omitempty"`
	ProfileResponse          json.RawMessage `json:"profileResponse,omitempty"`
	PolicyResponse           json.RawMessage `json:"policyResponse,omitempty"`
	DesktopObserveResponse   json.RawMessage `json:"desktopObserveResponse,omitempty"`
	DesktopActuateResponse   json.RawMessage `json:"desktopActuateResponse,omitempty"`
	DesktopVerifyResponse    json.RawMessage `json:"desktopVerifyResponse,omitempty"`
	EvidenceRecordResponse   json.RawMessage `json:"evidenceRecordResponse,omitempty"`
	EvidenceBundleResponse   json.RawMessage `json:"evidenceBundleResponse,omitempty"`
	ErrorMessage             string          `json:"errorMessage,omitempty"`
	CreatedAt                time.Time       `json:"createdAt"`
	UpdatedAt                time.Time       `json:"updatedAt"`
}

type RunSummary struct {
	RunID                    string     `json:"runId"`
	RequestID                string     `json:"requestId"`
	TenantID                 string     `json:"tenantId,omitempty"`
	ProjectID                string     `json:"projectId,omitempty"`
	Environment              string     `json:"environment,omitempty"`
	RetentionClass           string     `json:"retentionClass,omitempty"`
	ExpiresAt                *time.Time `json:"expiresAt,omitempty"`
	Status                   RunStatus  `json:"status"`
	SelectedProfileProvider  string     `json:"selectedProfileProvider,omitempty"`
	SelectedPolicyProvider   string     `json:"selectedPolicyProvider,omitempty"`
	SelectedEvidenceProvider string     `json:"selectedEvidenceProvider,omitempty"`
	SelectedDesktopProvider  string     `json:"selectedDesktopProvider,omitempty"`
	PolicyDecision           string     `json:"policyDecision,omitempty"`
	PolicyBundleID           string     `json:"policyBundleId,omitempty"`
	PolicyBundleVersion      string     `json:"policyBundleVersion,omitempty"`
	PolicyGrantTokenPresent  bool       `json:"policyGrantTokenPresent,omitempty"`
	PolicyGrantTokenSHA256   string     `json:"policyGrantTokenSha256,omitempty"`
	CreatedAt                time.Time  `json:"createdAt"`
	UpdatedAt                time.Time  `json:"updatedAt"`
}

type RunListQuery struct {
	Limit          int
	Offset         int
	TenantID       string
	ProjectID      string
	Environment    string
	Status         string
	PolicyDecision string
	ProviderID     string
	RetentionClass string
	Search         string
	CreatedAfter   *time.Time
	CreatedBefore  *time.Time
	IncludeExpired bool
}

type RunPruneQuery struct {
	Before         time.Time
	RetentionClass string
	Limit          int
	DryRun         bool
}

type RunPruneResult struct {
	DryRun         bool      `json:"dryRun"`
	Before         time.Time `json:"before"`
	RetentionClass string    `json:"retentionClass,omitempty"`
	Limit          int       `json:"limit"`
	Matched        int       `json:"matched"`
	Deleted        int       `json:"deleted"`
	RunIDs         []string  `json:"runIds,omitempty"`
}

type IntegrationSettingsRecord struct {
	TenantID  string          `json:"tenantId,omitempty"`
	ProjectID string          `json:"projectId,omitempty"`
	Settings  json.RawMessage `json:"settings"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type IntegrationSettingsUpsertRequest struct {
	Meta     ObjectMeta      `json:"meta"`
	Settings json.RawMessage `json:"settings"`
}

type IntegrationSettingsResponse struct {
	Source      string          `json:"source,omitempty"`
	TenantID    string          `json:"tenantId,omitempty"`
	ProjectID   string          `json:"projectId,omitempty"`
	HasSettings bool            `json:"hasSettings"`
	Settings    json.RawMessage `json:"settings"`
	CreatedAt   *time.Time      `json:"createdAt,omitempty"`
	UpdatedAt   *time.Time      `json:"updatedAt,omitempty"`
}

type ApprovalStatus string

const (
	ApprovalStatusPending   ApprovalStatus = "PENDING"
	ApprovalStatusApproved  ApprovalStatus = "APPROVED"
	ApprovalStatusDenied    ApprovalStatus = "DENIED"
	ApprovalStatusExpired   ApprovalStatus = "EXPIRED"
	ApprovalStatusCancelled ApprovalStatus = "CANCELLED"
)

type ApprovalRecord struct {
	ApprovalID             string         `json:"approvalId"`
	RunID                  string         `json:"runId"`
	RequestID              string         `json:"requestId,omitempty"`
	TenantID               string         `json:"tenantId,omitempty"`
	ProjectID              string         `json:"projectId,omitempty"`
	Tier                   int            `json:"tier"`
	TargetOS               string         `json:"targetOS,omitempty"`
	TargetExecutionProfile string         `json:"targetExecutionProfile,omitempty"`
	RequestedCapabilities  []string       `json:"requestedCapabilities,omitempty"`
	RequiredVerifierIDs    []string       `json:"requiredVerifierIds,omitempty"`
	Status                 ApprovalStatus `json:"status"`
	Reason                 string         `json:"reason,omitempty"`
	CreatedAt              time.Time      `json:"createdAt"`
	ExpiresAt              *time.Time     `json:"expiresAt,omitempty"`
	ReviewedAt             *time.Time     `json:"reviewedAt,omitempty"`
}

type ApprovalDecisionRequest struct {
	Decision   string `json:"decision"`
	Reason     string `json:"reason,omitempty"`
	TTLSeconds int    `json:"ttlSeconds,omitempty"`
	GrantToken string `json:"grantToken,omitempty"`
}

type ApprovalDecisionResponse struct {
	Applied    bool           `json:"applied"`
	RunID      string         `json:"runId"`
	Decision   string         `json:"decision"`
	Status     ApprovalStatus `json:"status"`
	Reason     string         `json:"reason,omitempty"`
	ReviewedAt string         `json:"reviewedAt,omitempty"`
}

type PolicyBundleRef struct {
	PolicyID      string `json:"policyId,omitempty"`
	PolicyVersion string `json:"policyVersion,omitempty"`
	Checksum      string `json:"checksum,omitempty"`
}

type DesktopExecutionRequest struct {
	Enabled                bool       `json:"enabled,omitempty"`
	Tier                   int        `json:"tier,omitempty"`
	TargetOS               string     `json:"targetOS,omitempty"`
	TargetExecutionProfile string     `json:"targetExecutionProfile,omitempty"`
	StepID                 string     `json:"stepId,omitempty"`
	RequestedCapabilities  []string   `json:"requestedCapabilities,omitempty"`
	RequiredVerifierIDs    []string   `json:"requiredVerifierIds,omitempty"`
	Observer               JSONObject `json:"observer,omitempty"`
	Actuation              JSONObject `json:"actuation,omitempty"`
	PostAction             JSONObject `json:"postAction,omitempty"`
	HumanApprovalGranted   bool       `json:"humanApprovalGranted,omitempty"`
	RestrictedHostOptIn    bool       `json:"restrictedHostOptIn,omitempty"`
}

type DesktopVerifierPolicy struct {
	RequiredVerifierIDs []string `json:"requiredVerifierIds"`
}

type DesktopGrantEnvelope struct {
	CapabilityGrantToken string     `json:"capabilityGrantToken,omitempty"`
	CapabilityScope      JSONObject `json:"capabilityScope,omitempty"`
	GrantExpiresAt       string     `json:"grantExpiresAt,omitempty"`
}

type DesktopStepEnvelope struct {
	RunID                  string                `json:"runId"`
	StepID                 string                `json:"stepId"`
	TargetOS               string                `json:"targetOS"`
	TargetExecutionProfile string                `json:"targetExecutionProfile"`
	RequestedCapabilities  []string              `json:"requestedCapabilities"`
	VerifierPolicy         DesktopVerifierPolicy `json:"verifierPolicy"`
	Grant                  *DesktopGrantEnvelope `json:"grant,omitempty"`
}

type DesktopEvidenceBundle struct {
	WindowMetadata JSONObject `json:"windowMetadata"`
	ScreenshotHash string     `json:"screenshotHash"`
	ResultCode     string     `json:"resultCode"`
	ScreenshotURI  string     `json:"screenshotUri,omitempty"`
}

type DesktopDecisionResponse struct {
	Decision             string   `json:"decision"`
	VerifierID           string   `json:"verifierId"`
	ReasonCode           string   `json:"reasonCode"`
	ReasonMessage        string   `json:"reasonMessage,omitempty"`
	ObservedCapabilities []string `json:"observedCapabilities,omitempty"`
}

type DesktopObserveRequest struct {
	Meta     ObjectMeta          `json:"meta"`
	Step     DesktopStepEnvelope `json:"step"`
	Observer JSONObject          `json:"observer"`
}

type DesktopObserveResponse struct {
	DesktopDecisionResponse
	EvidenceBundle DesktopEvidenceBundle `json:"evidenceBundle"`
}

type DesktopActuateRequest struct {
	Meta   ObjectMeta          `json:"meta"`
	Step   DesktopStepEnvelope `json:"step"`
	Action JSONObject          `json:"action"`
}

type DesktopActuateResponse struct {
	DesktopDecisionResponse
	EvidenceBundle *DesktopEvidenceBundle `json:"evidenceBundle,omitempty"`
}

type DesktopVerifyRequest struct {
	Meta       ObjectMeta          `json:"meta"`
	Step       DesktopStepEnvelope `json:"step"`
	PostAction JSONObject          `json:"postAction"`
}

type DesktopVerifyResponse struct {
	DesktopDecisionResponse
	EvidenceBundle DesktopEvidenceBundle `json:"evidenceBundle"`
}

type TerminalSessionScope struct {
	RunID       string `json:"runId"`
	TenantID    string `json:"tenantId,omitempty"`
	ProjectID   string `json:"projectId,omitempty"`
	Environment string `json:"environment,omitempty"`
}

type TerminalCommandRequest struct {
	Text              string `json:"text"`
	CWD               string `json:"cwd,omitempty"`
	TimeoutSeconds    int    `json:"timeoutSeconds,omitempty"`
	ReadOnlyRequested bool   `json:"readOnlyRequested,omitempty"`
}

type TerminalSafetyRequest struct {
	TerminalMode          string `json:"terminalMode,omitempty"`
	RestrictedHostMode    string `json:"restrictedHostMode,omitempty"`
	RestrictedHostRequest bool   `json:"restrictedHostRequest,omitempty"`
}

type TerminalProvenance struct {
	Source         string `json:"source,omitempty"`
	CommandTag     string `json:"commandTag,omitempty"`
	AgentProfileID string `json:"agentProfileId,omitempty"`
}

type TerminalAuditLink struct {
	Event      string `json:"event,omitempty"`
	RunID      string `json:"runId,omitempty"`
	ProviderID string `json:"providerId,omitempty"`
}

type TerminalSessionCreateRequest struct {
	Meta       ObjectMeta             `json:"meta"`
	Scope      TerminalSessionScope   `json:"scope"`
	Command    TerminalCommandRequest `json:"command"`
	Safety     TerminalSafetyRequest  `json:"safety"`
	Provenance TerminalProvenance     `json:"provenance,omitempty"`
	AuditLink  TerminalAuditLink      `json:"auditLink,omitempty"`
}

type TerminalExecutionResult struct {
	ExitCode     int    `json:"exitCode"`
	Output       string `json:"output,omitempty"`
	OutputSHA256 string `json:"outputSha256,omitempty"`
	TimedOut     bool   `json:"timedOut,omitempty"`
	Truncated    bool   `json:"truncated,omitempty"`
}

type TerminalSessionCreateResponse struct {
	Source        string                   `json:"source,omitempty"`
	Applied       bool                     `json:"applied"`
	SessionID     string                   `json:"sessionId,omitempty"`
	RequestedAt   string                   `json:"requestedAt,omitempty"`
	Status        string                   `json:"status,omitempty"`
	RunID         string                   `json:"runId,omitempty"`
	ProvenanceTag string                   `json:"provenanceTag,omitempty"`
	AuditLink     TerminalAuditLink        `json:"auditLink,omitempty"`
	Warning       string                   `json:"warning,omitempty"`
	Result        *TerminalExecutionResult `json:"result,omitempty"`
}

type APIError struct {
	ErrorCode string                 `json:"errorCode"`
	Message   string                 `json:"message"`
	Retryable bool                   `json:"retryable"`
	Details   map[string]interface{} `json:"details,omitempty"`
}
