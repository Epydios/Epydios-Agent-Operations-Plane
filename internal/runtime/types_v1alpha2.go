package runtime

import (
	"encoding/json"
	"time"
)

type TaskStatus string

const (
	TaskStatusNew        TaskStatus = "NEW"
	TaskStatusReady      TaskStatus = "READY"
	TaskStatusBlocked    TaskStatus = "BLOCKED"
	TaskStatusInProgress TaskStatus = "IN_PROGRESS"
	TaskStatusCompleted  TaskStatus = "COMPLETED"
	TaskStatusFailed     TaskStatus = "FAILED"
	TaskStatusCancelled  TaskStatus = "CANCELLED"
)

type SessionStatus string

const (
	SessionStatusPending          SessionStatus = "PENDING"
	SessionStatusReady            SessionStatus = "READY"
	SessionStatusAwaitingWorker   SessionStatus = "AWAITING_WORKER"
	SessionStatusRunning          SessionStatus = "RUNNING"
	SessionStatusAwaitingApproval SessionStatus = "AWAITING_APPROVAL"
	SessionStatusBlocked          SessionStatus = "BLOCKED"
	SessionStatusCompleted        SessionStatus = "COMPLETED"
	SessionStatusFailed           SessionStatus = "FAILED"
	SessionStatusCancelled        SessionStatus = "CANCELLED"
)

type WorkerStatus string

const (
	WorkerStatusAttached  WorkerStatus = "ATTACHED"
	WorkerStatusReady     WorkerStatus = "READY"
	WorkerStatusRunning   WorkerStatus = "RUNNING"
	WorkerStatusWaiting   WorkerStatus = "WAITING"
	WorkerStatusBlocked   WorkerStatus = "BLOCKED"
	WorkerStatusCompleted WorkerStatus = "COMPLETED"
	WorkerStatusFailed    WorkerStatus = "FAILED"
	WorkerStatusDetached  WorkerStatus = "DETACHED"
)

type ToolActionStatus string

const (
	ToolActionStatusRequested     ToolActionStatus = "REQUESTED"
	ToolActionStatusAuthorized    ToolActionStatus = "AUTHORIZED"
	ToolActionStatusStarted       ToolActionStatus = "STARTED"
	ToolActionStatusCompleted     ToolActionStatus = "COMPLETED"
	ToolActionStatusPolicyBlocked ToolActionStatus = "POLICY_BLOCKED"
	ToolActionStatusFailed        ToolActionStatus = "FAILED"
	ToolActionStatusCancelled     ToolActionStatus = "CANCELLED"
)

type SessionEventType string

type TaskCreateRequest struct {
	Meta        ObjectMeta `json:"meta"`
	Source      string     `json:"source,omitempty"`
	Title       string     `json:"title"`
	Intent      string     `json:"intent"`
	RequestedBy JSONObject `json:"requestedBy,omitempty"`
	Annotations JSONObject `json:"annotations,omitempty"`
}

type TaskRecord struct {
	TaskID          string          `json:"taskId"`
	RequestID       string          `json:"requestId,omitempty"`
	TenantID        string          `json:"tenantId,omitempty"`
	ProjectID       string          `json:"projectId,omitempty"`
	Source          string          `json:"source,omitempty"`
	Title           string          `json:"title"`
	Intent          string          `json:"intent"`
	RequestedBy     json.RawMessage `json:"requestedBy,omitempty"`
	Status          TaskStatus      `json:"status"`
	Annotations     json.RawMessage `json:"annotations,omitempty"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
	LatestSessionID string          `json:"latestSessionId,omitempty"`
}

type TaskListQuery struct {
	Limit     int
	Offset    int
	TenantID  string
	ProjectID string
	Status    string
	Search    string
}

type SessionCreateRequest struct {
	Meta        ObjectMeta `json:"meta"`
	SessionType string     `json:"sessionType,omitempty"`
	Source      string     `json:"source,omitempty"`
	LegacyRunID string     `json:"legacyRunId,omitempty"`
	Summary     JSONObject `json:"summary,omitempty"`
	Annotations JSONObject `json:"annotations,omitempty"`
}

type SessionRecord struct {
	SessionID        string          `json:"sessionId"`
	TaskID           string          `json:"taskId"`
	RequestID        string          `json:"requestId,omitempty"`
	LegacyRunID      string          `json:"legacyRunId,omitempty"`
	TenantID         string          `json:"tenantId,omitempty"`
	ProjectID        string          `json:"projectId,omitempty"`
	SessionType      string          `json:"sessionType,omitempty"`
	Status           SessionStatus   `json:"status"`
	Source           string          `json:"source,omitempty"`
	SelectedWorkerID string          `json:"selectedWorkerId,omitempty"`
	Summary          json.RawMessage `json:"summary,omitempty"`
	Annotations      json.RawMessage `json:"annotations,omitempty"`
	CreatedAt        time.Time       `json:"createdAt"`
	StartedAt        time.Time       `json:"startedAt"`
	UpdatedAt        time.Time       `json:"updatedAt"`
	CompletedAt      *time.Time      `json:"completedAt,omitempty"`
}

type SessionListQuery struct {
	Limit         int
	Offset        int
	TaskID        string
	TenantID      string
	ProjectID     string
	Status        string
	SessionType   string
	Search        string
	IncludeLegacy bool
}

type SessionWorkerAttachRequest struct {
	Meta              ObjectMeta `json:"meta"`
	WorkerType        string     `json:"workerType"`
	AdapterID         string     `json:"adapterId"`
	Source            string     `json:"source,omitempty"`
	Routing           string     `json:"routing,omitempty"`
	AgentProfileID    string     `json:"agentProfileId,omitempty"`
	Provider          string     `json:"provider,omitempty"`
	Transport         string     `json:"transport,omitempty"`
	Model             string     `json:"model,omitempty"`
	TargetEnvironment string     `json:"targetEnvironment,omitempty"`
	Capabilities      []string   `json:"capabilities,omitempty"`
	Annotations       JSONObject `json:"annotations,omitempty"`
}

type SessionWorkerRecord struct {
	WorkerID          string          `json:"workerId"`
	SessionID         string          `json:"sessionId"`
	TaskID            string          `json:"taskId"`
	TenantID          string          `json:"tenantId,omitempty"`
	ProjectID         string          `json:"projectId,omitempty"`
	WorkerType        string          `json:"workerType"`
	AdapterID         string          `json:"adapterId"`
	Status            WorkerStatus    `json:"status"`
	Source            string          `json:"source,omitempty"`
	Capabilities      []string        `json:"capabilities,omitempty"`
	Routing           string          `json:"routing,omitempty"`
	AgentProfileID    string          `json:"agentProfileId,omitempty"`
	Provider          string          `json:"provider,omitempty"`
	Transport         string          `json:"transport,omitempty"`
	Model             string          `json:"model,omitempty"`
	TargetEnvironment string          `json:"targetEnvironment,omitempty"`
	Annotations       json.RawMessage `json:"annotations,omitempty"`
	CreatedAt         time.Time       `json:"createdAt"`
	UpdatedAt         time.Time       `json:"updatedAt"`
}

type SessionWorkerListQuery struct {
	SessionID  string
	TenantID   string
	ProjectID  string
	Status     string
	WorkerType string
	Limit      int
}

type WorkerEventCreateRequest struct {
	Meta      ObjectMeta      `json:"meta"`
	EventType string          `json:"eventType,omitempty"`
	Status    WorkerStatus    `json:"status,omitempty"`
	Severity  string          `json:"severity,omitempty"`
	Summary   string          `json:"summary,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

type ToolActionCreateRequest struct {
	Meta                  ObjectMeta       `json:"meta"`
	WorkerID              string           `json:"workerId,omitempty"`
	ToolType              string           `json:"toolType"`
	Status                ToolActionStatus `json:"status,omitempty"`
	Source                string           `json:"source,omitempty"`
	RequestPayload        json.RawMessage  `json:"requestPayload,omitempty"`
	ResultPayload         json.RawMessage  `json:"resultPayload,omitempty"`
	PolicyDecision        string           `json:"policyDecision,omitempty"`
	ApprovalCheckpointID  string           `json:"approvalCheckpointId,omitempty"`
	AuditLink             JSONObject       `json:"auditLink,omitempty"`
	ReadOnly              bool             `json:"readOnly,omitempty"`
	RestrictedHostRequest bool             `json:"restrictedHostRequest,omitempty"`
}

type ToolActionRecord struct {
	ToolActionID          string           `json:"toolActionId"`
	SessionID             string           `json:"sessionId"`
	WorkerID              string           `json:"workerId,omitempty"`
	TenantID              string           `json:"tenantId,omitempty"`
	ProjectID             string           `json:"projectId,omitempty"`
	ToolType              string           `json:"toolType"`
	Status                ToolActionStatus `json:"status"`
	Source                string           `json:"source,omitempty"`
	RequestPayload        json.RawMessage  `json:"requestPayload,omitempty"`
	ResultPayload         json.RawMessage  `json:"resultPayload,omitempty"`
	PolicyDecision        string           `json:"policyDecision,omitempty"`
	ApprovalCheckpointID  string           `json:"approvalCheckpointId,omitempty"`
	AuditLink             json.RawMessage  `json:"auditLink,omitempty"`
	ReadOnly              bool             `json:"readOnly,omitempty"`
	RestrictedHostRequest bool             `json:"restrictedHostRequest,omitempty"`
	CreatedAt             time.Time        `json:"createdAt"`
	UpdatedAt             time.Time        `json:"updatedAt"`
}

type ToolActionListQuery struct {
	SessionID string
	TenantID  string
	ProjectID string
	WorkerID  string
	ToolType  string
	Status    ToolActionStatus
	Limit     int
}

type ToolProposalDecisionRequest struct {
	Meta     ObjectMeta `json:"meta"`
	Decision string     `json:"decision"`
	Reason   string     `json:"reason,omitempty"`
}

type ToolProposalDecisionResponse struct {
	Applied      bool             `json:"applied"`
	SessionID    string           `json:"sessionId"`
	ProposalID   string           `json:"proposalId"`
	Decision     string           `json:"decision"`
	Status       string           `json:"status"`
	Reason       string           `json:"reason,omitempty"`
	ToolActionID string           `json:"toolActionId,omitempty"`
	WorkerID     string           `json:"workerId,omitempty"`
	ToolType     string           `json:"toolType,omitempty"`
	ActionStatus ToolActionStatus `json:"actionStatus,omitempty"`
	ReviewedAt   string           `json:"reviewedAt,omitempty"`
}

type SessionEventRecord struct {
	EventID   string           `json:"eventId"`
	SessionID string           `json:"sessionId"`
	Sequence  int64            `json:"sequence"`
	EventType SessionEventType `json:"eventType"`
	Payload   json.RawMessage  `json:"payload,omitempty"`
	Timestamp time.Time        `json:"timestamp"`
}

type SessionEventListQuery struct {
	SessionID     string
	Limit         int
	AfterSequence int64
}

type ApprovalCheckpointRecord struct {
	CheckpointID           string         `json:"checkpointId"`
	SessionID              string         `json:"sessionId"`
	LegacyRunID            string         `json:"legacyRunId,omitempty"`
	RequestID              string         `json:"requestId,omitempty"`
	TenantID               string         `json:"tenantId,omitempty"`
	ProjectID              string         `json:"projectId,omitempty"`
	Scope                  string         `json:"scope,omitempty"`
	Tier                   int            `json:"tier,omitempty"`
	TargetOS               string         `json:"targetOs,omitempty"`
	TargetExecutionProfile string         `json:"targetExecutionProfile,omitempty"`
	RequestedCapabilities  []string       `json:"requestedCapabilities,omitempty"`
	RequiredVerifierIDs    []string       `json:"requiredVerifierIds,omitempty"`
	Status                 ApprovalStatus `json:"status"`
	Reason                 string         `json:"reason,omitempty"`
	CreatedAt              time.Time      `json:"createdAt"`
	ExpiresAt              *time.Time     `json:"expiresAt,omitempty"`
	ReviewedAt             *time.Time     `json:"reviewedAt,omitempty"`
	UpdatedAt              time.Time      `json:"updatedAt"`
}

type ApprovalCheckpointCreateRequest struct {
	Meta                   ObjectMeta `json:"meta"`
	Scope                  string     `json:"scope,omitempty"`
	Tier                   int        `json:"tier,omitempty"`
	TargetOS               string     `json:"targetOs,omitempty"`
	TargetExecutionProfile string     `json:"targetExecutionProfile,omitempty"`
	RequestedCapabilities  []string   `json:"requestedCapabilities,omitempty"`
	RequiredVerifierIDs    []string   `json:"requiredVerifierIds,omitempty"`
	Reason                 string     `json:"reason,omitempty"`
	TTLSeconds             int        `json:"ttlSeconds,omitempty"`
}

type ApprovalCheckpointDecisionRequest struct {
	Meta     ObjectMeta `json:"meta"`
	Decision string     `json:"decision"`
	Reason   string     `json:"reason,omitempty"`
}

type ApprovalCheckpointDecisionResponse struct {
	Applied      bool           `json:"applied"`
	SessionID    string         `json:"sessionId"`
	CheckpointID string         `json:"checkpointId"`
	Decision     string         `json:"decision"`
	Status       ApprovalStatus `json:"status"`
	Reason       string         `json:"reason,omitempty"`
	ReviewedAt   string         `json:"reviewedAt,omitempty"`
}

type ApprovalCheckpointListQuery struct {
	CheckpointID  string
	SessionID     string
	TenantID      string
	ProjectID     string
	Status        ApprovalStatus
	Limit         int
	IncludeLegacy bool
}

type EvidenceRecordCreateRequest struct {
	Meta           ObjectMeta `json:"meta"`
	Kind           string     `json:"kind"`
	ToolActionID   string     `json:"toolActionId,omitempty"`
	CheckpointID   string     `json:"checkpointId,omitempty"`
	URI            string     `json:"uri,omitempty"`
	Checksum       string     `json:"checksum,omitempty"`
	Metadata       JSONObject `json:"metadata,omitempty"`
	RetentionClass string     `json:"retentionClass,omitempty"`
}

type EvidenceRecord struct {
	EvidenceID     string          `json:"evidenceId"`
	SessionID      string          `json:"sessionId"`
	ToolActionID   string          `json:"toolActionId,omitempty"`
	CheckpointID   string          `json:"checkpointId,omitempty"`
	TenantID       string          `json:"tenantId,omitempty"`
	ProjectID      string          `json:"projectId,omitempty"`
	Kind           string          `json:"kind"`
	URI            string          `json:"uri,omitempty"`
	Checksum       string          `json:"checksum,omitempty"`
	Metadata       json.RawMessage `json:"metadata,omitempty"`
	RetentionClass string          `json:"retentionClass,omitempty"`
	CreatedAt      time.Time       `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
}

type EvidenceRecordListQuery struct {
	SessionID      string
	TenantID       string
	ProjectID      string
	Kind           string
	RetentionClass string
	Limit          int
}

type SessionCloseRequest struct {
	Meta        ObjectMeta    `json:"meta"`
	Status      SessionStatus `json:"status,omitempty"`
	Reason      string        `json:"reason,omitempty"`
	Summary     JSONObject    `json:"summary,omitempty"`
	Annotations JSONObject    `json:"annotations,omitempty"`
}

type SessionTimelineResponse struct {
	Session             SessionRecord              `json:"session"`
	Task                *TaskRecord                `json:"task,omitempty"`
	SelectedWorker      *SessionWorkerRecord       `json:"selectedWorker,omitempty"`
	Workers             []SessionWorkerRecord      `json:"workers"`
	ApprovalCheckpoints []ApprovalCheckpointRecord `json:"approvalCheckpoints"`
	ToolActions         []ToolActionRecord         `json:"toolActions"`
	EvidenceRecords     []EvidenceRecord           `json:"evidenceRecords"`
	Events              []SessionEventRecord       `json:"events"`
	OpenApprovalCount   int                        `json:"openApprovalCount"`
	LatestEventSequence int64                      `json:"latestEventSequence,omitempty"`
}
