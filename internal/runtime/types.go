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

type APIError struct {
	ErrorCode string                 `json:"errorCode"`
	Message   string                 `json:"message"`
	Retryable bool                   `json:"retryable"`
	Details   map[string]interface{} `json:"details,omitempty"`
}
