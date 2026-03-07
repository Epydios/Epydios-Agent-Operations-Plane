package runtime

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func m16SchemaStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS orchestration_tasks (
			task_id TEXT PRIMARY KEY,
			request_id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			source TEXT,
			title TEXT NOT NULL,
			intent TEXT NOT NULL,
			requested_by JSONB NOT NULL DEFAULT '{}'::jsonb,
			status TEXT NOT NULL,
			annotations JSONB NOT NULL DEFAULT '{}'::jsonb,
			latest_session_id TEXT,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_tasks_scope ON orchestration_tasks (tenant_id, project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_tasks_created_at ON orchestration_tasks (created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_tasks_status ON orchestration_tasks (status)`,
		`CREATE TABLE IF NOT EXISTS orchestration_sessions (
			session_id TEXT PRIMARY KEY,
			task_id TEXT NOT NULL,
			request_id TEXT,
			legacy_run_id TEXT,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			session_type TEXT NOT NULL,
			status TEXT NOT NULL,
			source TEXT,
			selected_worker_id TEXT,
			summary JSONB NOT NULL DEFAULT '{}'::jsonb,
			annotations JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL,
			started_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			completed_at TIMESTAMPTZ
		)`,
		`ALTER TABLE orchestration_sessions ADD COLUMN IF NOT EXISTS selected_worker_id TEXT`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_scope ON orchestration_sessions (tenant_id, project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_task_id ON orchestration_sessions (task_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_created_at ON orchestration_sessions (created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_status ON orchestration_sessions (status)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_selected_worker_id ON orchestration_sessions (selected_worker_id)`,
		`CREATE TABLE IF NOT EXISTS orchestration_session_workers (
			worker_id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			task_id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			worker_type TEXT NOT NULL,
			adapter_id TEXT NOT NULL,
			status TEXT NOT NULL,
			source TEXT,
			capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
			routing TEXT,
			agent_profile_id TEXT,
			provider TEXT,
			transport TEXT,
			model TEXT,
			target_environment TEXT,
			annotations JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_session_workers_session_id ON orchestration_session_workers (session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_session_workers_scope ON orchestration_session_workers (tenant_id, project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_session_workers_status ON orchestration_session_workers (status)`,
		`CREATE TABLE IF NOT EXISTS orchestration_tool_actions (
			tool_action_id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			worker_id TEXT,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			tool_type TEXT NOT NULL,
			status TEXT NOT NULL,
			source TEXT,
			request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
			result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
			policy_decision TEXT,
			approval_checkpoint_id TEXT,
			audit_link JSONB NOT NULL DEFAULT '{}'::jsonb,
			read_only BOOLEAN NOT NULL DEFAULT FALSE,
			restricted_host_request BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_tool_actions_session_id ON orchestration_tool_actions (session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_tool_actions_scope ON orchestration_tool_actions (tenant_id, project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_tool_actions_status ON orchestration_tool_actions (status)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_tool_actions_worker_id ON orchestration_tool_actions (worker_id)`,
		`CREATE TABLE IF NOT EXISTS orchestration_session_events (
			event_id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			sequence BIGINT NOT NULL,
			event_type TEXT NOT NULL,
			payload JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_orchestration_session_events_session_sequence ON orchestration_session_events (session_id, sequence)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_session_events_session_created_at ON orchestration_session_events (session_id, created_at ASC)`,
		`CREATE TABLE IF NOT EXISTS orchestration_approval_checkpoints (
			checkpoint_id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			legacy_run_id TEXT,
			request_id TEXT,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			scope TEXT,
			tier INTEGER NOT NULL DEFAULT 0,
			target_os TEXT,
			target_execution_profile TEXT,
			requested_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
			required_verifier_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
			status TEXT NOT NULL,
			reason TEXT,
			created_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ,
			reviewed_at TIMESTAMPTZ,
			updated_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_approval_checkpoints_scope ON orchestration_approval_checkpoints (tenant_id, project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_approval_checkpoints_session_id ON orchestration_approval_checkpoints (session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_approval_checkpoints_status ON orchestration_approval_checkpoints (status)`,
		`CREATE TABLE IF NOT EXISTS orchestration_evidence_records (
			evidence_id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			tool_action_id TEXT,
			checkpoint_id TEXT,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			uri TEXT,
			checksum TEXT,
			metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
			retention_class TEXT,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_evidence_records_session_id ON orchestration_evidence_records (session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_evidence_records_scope ON orchestration_evidence_records (tenant_id, project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_evidence_records_kind ON orchestration_evidence_records (kind)`,
	}
}

func (s *PostgresRunStore) UpsertTask(ctx context.Context, task *TaskRecord) error {
	if task == nil {
		return fmt.Errorf("task record is required")
	}
	task.TaskID = strings.TrimSpace(task.TaskID)
	task.RequestID = strings.TrimSpace(task.RequestID)
	task.TenantID = strings.TrimSpace(task.TenantID)
	task.ProjectID = strings.TrimSpace(task.ProjectID)
	task.Source = strings.TrimSpace(task.Source)
	task.Title = strings.TrimSpace(task.Title)
	task.Intent = strings.TrimSpace(task.Intent)
	task.LatestSessionID = strings.TrimSpace(task.LatestSessionID)
	if task.TaskID == "" {
		return fmt.Errorf("taskId is required")
	}
	if task.RequestID == "" {
		return fmt.Errorf("task requestId is required")
	}
	if task.TenantID == "" || task.ProjectID == "" {
		return fmt.Errorf("task tenantId and projectId are required")
	}
	if task.Title == "" || task.Intent == "" {
		return fmt.Errorf("task title and intent are required")
	}
	if strings.TrimSpace(string(task.Status)) == "" {
		task.Status = TaskStatusNew
	}
	createdAt := task.CreatedAt.UTC()
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
		task.CreatedAt = createdAt
	}
	updatedAt := task.UpdatedAt.UTC()
	if updatedAt.IsZero() {
		updatedAt = createdAt
		task.UpdatedAt = updatedAt
	}

	const q = `
INSERT INTO orchestration_tasks (
	task_id, request_id, tenant_id, project_id, source, title, intent, requested_by, status, annotations, latest_session_id, created_at, updated_at
) VALUES (
	$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
)
ON CONFLICT (task_id) DO UPDATE SET
	request_id = EXCLUDED.request_id,
	tenant_id = EXCLUDED.tenant_id,
	project_id = EXCLUDED.project_id,
	source = EXCLUDED.source,
	title = EXCLUDED.title,
	intent = EXCLUDED.intent,
	requested_by = EXCLUDED.requested_by,
	status = EXCLUDED.status,
	annotations = EXCLUDED.annotations,
	latest_session_id = EXCLUDED.latest_session_id,
	updated_at = EXCLUDED.updated_at
`
	_, err := s.db.ExecContext(
		ctx,
		q,
		task.TaskID,
		task.RequestID,
		task.TenantID,
		task.ProjectID,
		nullStr(task.Source),
		task.Title,
		task.Intent,
		jsonBytesOrEmptyObject(task.RequestedBy),
		string(task.Status),
		jsonBytesOrEmptyObject(task.Annotations),
		nullStr(task.LatestSessionID),
		createdAt,
		updatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert task %s: %w", task.TaskID, err)
	}
	return nil
}

func (s *PostgresRunStore) GetTask(ctx context.Context, taskID string) (*TaskRecord, error) {
	const q = `
SELECT
	task_id,
	request_id,
	tenant_id,
	project_id,
	COALESCE(source, ''),
	title,
	intent,
	requested_by,
	status,
	annotations,
	COALESCE(latest_session_id, ''),
	created_at,
	updated_at
FROM orchestration_tasks
WHERE task_id = $1
`
	var (
		rec         TaskRecord
		status      string
		requestedBy []byte
		annotations []byte
	)
	err := s.db.QueryRowContext(ctx, q, strings.TrimSpace(taskID)).Scan(
		&rec.TaskID,
		&rec.RequestID,
		&rec.TenantID,
		&rec.ProjectID,
		&rec.Source,
		&rec.Title,
		&rec.Intent,
		&requestedBy,
		&status,
		&annotations,
		&rec.LatestSessionID,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	rec.Status = TaskStatus(status)
	rec.RequestedBy = requestedBy
	rec.Annotations = annotations
	return &rec, nil
}

func (s *PostgresRunStore) ListTasks(ctx context.Context, query TaskListQuery) ([]TaskRecord, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	offset := query.Offset
	if offset < 0 {
		offset = 0
	}

	base := `
SELECT
	task_id,
	request_id,
	tenant_id,
	project_id,
	COALESCE(source, ''),
	title,
	intent,
	requested_by,
	status,
	annotations,
	COALESCE(latest_session_id, ''),
	created_at,
	updated_at
FROM orchestration_tasks
`
	clauses := make([]string, 0, 6)
	args := make([]interface{}, 0, 8)
	appendArg := func(v interface{}) int {
		args = append(args, v)
		return len(args)
	}
	if q := strings.TrimSpace(query.TenantID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("tenant_id = $%d", i))
	}
	if q := strings.TrimSpace(query.ProjectID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("project_id = $%d", i))
	}
	if q := strings.TrimSpace(query.Status); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("status = $%d", i))
	}
	if q := strings.TrimSpace(query.Search); q != "" {
		i := appendArg("%" + q + "%")
		clauses = append(clauses, fmt.Sprintf("(task_id ILIKE $%d OR request_id ILIKE $%d OR title ILIKE $%d OR intent ILIKE $%d)", i, i, i, i))
	}
	sqlText := base
	if len(clauses) > 0 {
		sqlText += " WHERE " + strings.Join(clauses, " AND ")
	}
	limitIdx := appendArg(limit)
	offsetIdx := appendArg(offset)
	sqlText += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", limitIdx, offsetIdx)

	rows, err := s.db.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]TaskRecord, 0, limit)
	for rows.Next() {
		var (
			item        TaskRecord
			status      string
			requestedBy []byte
			annotations []byte
		)
		if err := rows.Scan(
			&item.TaskID,
			&item.RequestID,
			&item.TenantID,
			&item.ProjectID,
			&item.Source,
			&item.Title,
			&item.Intent,
			&requestedBy,
			&status,
			&annotations,
			&item.LatestSessionID,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.Status = TaskStatus(status)
		item.RequestedBy = requestedBy
		item.Annotations = annotations
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *PostgresRunStore) UpsertSession(ctx context.Context, session *SessionRecord) error {
	if session == nil {
		return fmt.Errorf("session record is required")
	}
	session.SessionID = strings.TrimSpace(session.SessionID)
	session.TaskID = strings.TrimSpace(session.TaskID)
	session.RequestID = strings.TrimSpace(session.RequestID)
	session.LegacyRunID = strings.TrimSpace(session.LegacyRunID)
	session.TenantID = strings.TrimSpace(session.TenantID)
	session.ProjectID = strings.TrimSpace(session.ProjectID)
	session.SessionType = strings.TrimSpace(session.SessionType)
	session.Source = strings.TrimSpace(session.Source)
	session.SelectedWorkerID = strings.TrimSpace(session.SelectedWorkerID)
	if session.SessionID == "" {
		return fmt.Errorf("sessionId is required")
	}
	if session.TaskID == "" {
		return fmt.Errorf("session taskId is required")
	}
	if session.TenantID == "" || session.ProjectID == "" {
		return fmt.Errorf("session tenantId and projectId are required")
	}
	if session.SessionType == "" {
		session.SessionType = "operator_request"
	}
	if strings.TrimSpace(string(session.Status)) == "" {
		session.Status = SessionStatusPending
	}
	createdAt := session.CreatedAt.UTC()
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
		session.CreatedAt = createdAt
	}
	startedAt := session.StartedAt.UTC()
	if startedAt.IsZero() {
		startedAt = createdAt
		session.StartedAt = startedAt
	}
	updatedAt := session.UpdatedAt.UTC()
	if updatedAt.IsZero() {
		updatedAt = createdAt
		session.UpdatedAt = updatedAt
	}
	const q = `
INSERT INTO orchestration_sessions (
	session_id, task_id, request_id, legacy_run_id, tenant_id, project_id, session_type, status, source, selected_worker_id, summary, annotations, created_at, started_at, updated_at, completed_at
) VALUES (
	$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
)
ON CONFLICT (session_id) DO UPDATE SET
	task_id = EXCLUDED.task_id,
	request_id = EXCLUDED.request_id,
	legacy_run_id = EXCLUDED.legacy_run_id,
	tenant_id = EXCLUDED.tenant_id,
	project_id = EXCLUDED.project_id,
	session_type = EXCLUDED.session_type,
	status = EXCLUDED.status,
	source = EXCLUDED.source,
	selected_worker_id = EXCLUDED.selected_worker_id,
	summary = EXCLUDED.summary,
	annotations = EXCLUDED.annotations,
	started_at = EXCLUDED.started_at,
	updated_at = EXCLUDED.updated_at,
	completed_at = EXCLUDED.completed_at
`
	_, err := s.db.ExecContext(
		ctx,
		q,
		session.SessionID,
		session.TaskID,
		nullStr(session.RequestID),
		nullStr(session.LegacyRunID),
		session.TenantID,
		session.ProjectID,
		session.SessionType,
		string(session.Status),
		nullStr(session.Source),
		nullStr(session.SelectedWorkerID),
		jsonBytesOrEmptyObject(session.Summary),
		jsonBytesOrEmptyObject(session.Annotations),
		createdAt,
		startedAt,
		updatedAt,
		nullTime(session.CompletedAt),
	)
	if err != nil {
		return fmt.Errorf("upsert session %s: %w", session.SessionID, err)
	}
	return nil
}

func (s *PostgresRunStore) GetSession(ctx context.Context, sessionID string) (*SessionRecord, error) {
	const q = `
SELECT
	session_id,
	task_id,
	COALESCE(request_id, ''),
	COALESCE(legacy_run_id, ''),
	tenant_id,
	project_id,
	session_type,
	status,
	COALESCE(source, ''),
	COALESCE(selected_worker_id, ''),
	summary,
	annotations,
	created_at,
	started_at,
	updated_at,
	completed_at
FROM orchestration_sessions
WHERE session_id = $1
`
	var (
		rec         SessionRecord
		status      string
		summary     []byte
		annotations []byte
		completedAt sql.NullTime
	)
	err := s.db.QueryRowContext(ctx, q, strings.TrimSpace(sessionID)).Scan(
		&rec.SessionID,
		&rec.TaskID,
		&rec.RequestID,
		&rec.LegacyRunID,
		&rec.TenantID,
		&rec.ProjectID,
		&rec.SessionType,
		&status,
		&rec.Source,
		&rec.SelectedWorkerID,
		&summary,
		&annotations,
		&rec.CreatedAt,
		&rec.StartedAt,
		&rec.UpdatedAt,
		&completedAt,
	)
	if err != nil {
		return nil, err
	}
	rec.Status = SessionStatus(status)
	rec.Summary = summary
	rec.Annotations = annotations
	if completedAt.Valid {
		t := completedAt.Time.UTC()
		rec.CompletedAt = &t
	}
	return &rec, nil
}

func (s *PostgresRunStore) ListSessions(ctx context.Context, query SessionListQuery) ([]SessionRecord, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	offset := query.Offset
	if offset < 0 {
		offset = 0
	}
	base := `
SELECT
	session_id,
	task_id,
	COALESCE(request_id, ''),
	COALESCE(legacy_run_id, ''),
	tenant_id,
	project_id,
	session_type,
	status,
	COALESCE(source, ''),
	COALESCE(selected_worker_id, ''),
	summary,
	annotations,
	created_at,
	started_at,
	updated_at,
	completed_at
FROM orchestration_sessions
`
	clauses := make([]string, 0, 8)
	args := make([]interface{}, 0, 10)
	appendArg := func(v interface{}) int {
		args = append(args, v)
		return len(args)
	}
	if q := strings.TrimSpace(query.TaskID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("task_id = $%d", i))
	}
	if q := strings.TrimSpace(query.TenantID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("tenant_id = $%d", i))
	}
	if q := strings.TrimSpace(query.ProjectID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("project_id = $%d", i))
	}
	if q := strings.TrimSpace(query.Status); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("status = $%d", i))
	}
	if q := strings.TrimSpace(query.SessionType); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("session_type = $%d", i))
	}
	if q := strings.TrimSpace(query.Search); q != "" {
		i := appendArg("%" + q + "%")
		clauses = append(clauses, fmt.Sprintf("(session_id ILIKE $%d OR task_id ILIKE $%d OR COALESCE(request_id,'') ILIKE $%d OR COALESCE(legacy_run_id,'') ILIKE $%d)", i, i, i, i))
	}
	sqlText := base
	if len(clauses) > 0 {
		sqlText += " WHERE " + strings.Join(clauses, " AND ")
	}
	limitIdx := appendArg(limit)
	offsetIdx := appendArg(offset)
	sqlText += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", limitIdx, offsetIdx)

	rows, err := s.db.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]SessionRecord, 0, limit)
	for rows.Next() {
		var (
			item        SessionRecord
			status      string
			summary     []byte
			annotations []byte
			completedAt sql.NullTime
		)
		if err := rows.Scan(
			&item.SessionID,
			&item.TaskID,
			&item.RequestID,
			&item.LegacyRunID,
			&item.TenantID,
			&item.ProjectID,
			&item.SessionType,
			&status,
			&item.Source,
			&item.SelectedWorkerID,
			&summary,
			&annotations,
			&item.CreatedAt,
			&item.StartedAt,
			&item.UpdatedAt,
			&completedAt,
		); err != nil {
			return nil, err
		}
		item.Status = SessionStatus(status)
		item.Summary = summary
		item.Annotations = annotations
		if completedAt.Valid {
			t := completedAt.Time.UTC()
			item.CompletedAt = &t
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *PostgresRunStore) UpsertSessionWorker(ctx context.Context, worker *SessionWorkerRecord) error {
	if worker == nil {
		return fmt.Errorf("session worker record is required")
	}
	worker.WorkerID = strings.TrimSpace(worker.WorkerID)
	worker.SessionID = strings.TrimSpace(worker.SessionID)
	worker.TaskID = strings.TrimSpace(worker.TaskID)
	worker.TenantID = strings.TrimSpace(worker.TenantID)
	worker.ProjectID = strings.TrimSpace(worker.ProjectID)
	worker.WorkerType = strings.TrimSpace(worker.WorkerType)
	worker.AdapterID = strings.TrimSpace(worker.AdapterID)
	worker.Source = strings.TrimSpace(worker.Source)
	worker.Routing = strings.TrimSpace(worker.Routing)
	worker.AgentProfileID = strings.TrimSpace(worker.AgentProfileID)
	worker.Provider = strings.TrimSpace(worker.Provider)
	worker.Transport = strings.TrimSpace(worker.Transport)
	worker.Model = strings.TrimSpace(worker.Model)
	worker.TargetEnvironment = strings.TrimSpace(worker.TargetEnvironment)
	if worker.WorkerID == "" {
		return fmt.Errorf("workerId is required")
	}
	if worker.SessionID == "" {
		return fmt.Errorf("sessionId is required")
	}
	if worker.TaskID == "" {
		return fmt.Errorf("taskId is required")
	}
	if worker.TenantID == "" || worker.ProjectID == "" {
		return fmt.Errorf("worker tenantId and projectId are required")
	}
	if worker.WorkerType == "" || worker.AdapterID == "" {
		return fmt.Errorf("workerType and adapterId are required")
	}
	if strings.TrimSpace(string(worker.Status)) == "" {
		worker.Status = WorkerStatusAttached
	}
	createdAt := worker.CreatedAt.UTC()
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
		worker.CreatedAt = createdAt
	}
	updatedAt := worker.UpdatedAt.UTC()
	if updatedAt.IsZero() {
		updatedAt = createdAt
		worker.UpdatedAt = updatedAt
	}
	capabilities, _ := json.Marshal(normalizeStringList(worker.Capabilities))

	const q = `
INSERT INTO orchestration_session_workers (
	worker_id, session_id, task_id, tenant_id, project_id, worker_type, adapter_id, status, source, capabilities, routing, agent_profile_id, provider, transport, model, target_environment, annotations, created_at, updated_at
) VALUES (
	$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
)
ON CONFLICT (worker_id) DO UPDATE SET
	session_id = EXCLUDED.session_id,
	task_id = EXCLUDED.task_id,
	tenant_id = EXCLUDED.tenant_id,
	project_id = EXCLUDED.project_id,
	worker_type = EXCLUDED.worker_type,
	adapter_id = EXCLUDED.adapter_id,
	status = EXCLUDED.status,
	source = EXCLUDED.source,
	capabilities = EXCLUDED.capabilities,
	routing = EXCLUDED.routing,
	agent_profile_id = EXCLUDED.agent_profile_id,
	provider = EXCLUDED.provider,
	transport = EXCLUDED.transport,
	model = EXCLUDED.model,
	target_environment = EXCLUDED.target_environment,
	annotations = EXCLUDED.annotations,
	updated_at = EXCLUDED.updated_at
`
	_, err := s.db.ExecContext(
		ctx,
		q,
		worker.WorkerID,
		worker.SessionID,
		worker.TaskID,
		worker.TenantID,
		worker.ProjectID,
		worker.WorkerType,
		worker.AdapterID,
		string(worker.Status),
		nullStr(worker.Source),
		capabilities,
		nullStr(worker.Routing),
		nullStr(worker.AgentProfileID),
		nullStr(worker.Provider),
		nullStr(worker.Transport),
		nullStr(worker.Model),
		nullStr(worker.TargetEnvironment),
		jsonBytesOrEmptyObject(worker.Annotations),
		createdAt,
		updatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert session worker %s: %w", worker.WorkerID, err)
	}
	return nil
}

func (s *PostgresRunStore) ListSessionWorkers(ctx context.Context, query SessionWorkerListQuery) ([]SessionWorkerRecord, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	base := `
SELECT
	worker_id,
	session_id,
	task_id,
	tenant_id,
	project_id,
	worker_type,
	adapter_id,
	status,
	COALESCE(source, ''),
	capabilities,
	COALESCE(routing, ''),
	COALESCE(agent_profile_id, ''),
	COALESCE(provider, ''),
	COALESCE(transport, ''),
	COALESCE(model, ''),
	COALESCE(target_environment, ''),
	annotations,
	created_at,
	updated_at
FROM orchestration_session_workers
`
	clauses := make([]string, 0, 6)
	args := make([]interface{}, 0, 8)
	appendArg := func(v interface{}) int {
		args = append(args, v)
		return len(args)
	}
	if q := strings.TrimSpace(query.SessionID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("session_id = $%d", i))
	}
	if q := strings.TrimSpace(query.TenantID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("tenant_id = $%d", i))
	}
	if q := strings.TrimSpace(query.ProjectID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("project_id = $%d", i))
	}
	if q := strings.TrimSpace(query.Status); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("status = $%d", i))
	}
	if q := strings.TrimSpace(query.WorkerType); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("worker_type = $%d", i))
	}
	sqlText := base
	if len(clauses) > 0 {
		sqlText += " WHERE " + strings.Join(clauses, " AND ")
	}
	limitIdx := appendArg(limit)
	sqlText += fmt.Sprintf(" ORDER BY created_at ASC LIMIT $%d", limitIdx)

	rows, err := s.db.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]SessionWorkerRecord, 0, limit)
	for rows.Next() {
		var (
			item            SessionWorkerRecord
			status          string
			capabilitiesRaw []byte
			annotations     []byte
		)
		if err := rows.Scan(
			&item.WorkerID,
			&item.SessionID,
			&item.TaskID,
			&item.TenantID,
			&item.ProjectID,
			&item.WorkerType,
			&item.AdapterID,
			&status,
			&item.Source,
			&capabilitiesRaw,
			&item.Routing,
			&item.AgentProfileID,
			&item.Provider,
			&item.Transport,
			&item.Model,
			&item.TargetEnvironment,
			&annotations,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.Status = WorkerStatus(status)
		item.Annotations = annotations
		_ = json.Unmarshal(capabilitiesRaw, &item.Capabilities)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *PostgresRunStore) UpsertToolAction(ctx context.Context, action *ToolActionRecord) error {
	if action == nil {
		return fmt.Errorf("tool action record is required")
	}
	action.ToolActionID = strings.TrimSpace(action.ToolActionID)
	action.SessionID = strings.TrimSpace(action.SessionID)
	action.WorkerID = strings.TrimSpace(action.WorkerID)
	action.TenantID = strings.TrimSpace(action.TenantID)
	action.ProjectID = strings.TrimSpace(action.ProjectID)
	action.ToolType = strings.TrimSpace(action.ToolType)
	action.Source = strings.TrimSpace(action.Source)
	action.PolicyDecision = strings.TrimSpace(action.PolicyDecision)
	action.ApprovalCheckpointID = strings.TrimSpace(action.ApprovalCheckpointID)
	if action.ToolActionID == "" {
		return fmt.Errorf("toolActionId is required")
	}
	if action.SessionID == "" {
		return fmt.Errorf("sessionId is required")
	}
	if action.TenantID == "" || action.ProjectID == "" {
		return fmt.Errorf("tool action tenantId and projectId are required")
	}
	if action.ToolType == "" {
		return fmt.Errorf("toolType is required")
	}
	if strings.TrimSpace(string(action.Status)) == "" {
		action.Status = ToolActionStatusRequested
	}
	createdAt := action.CreatedAt.UTC()
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
		action.CreatedAt = createdAt
	}
	updatedAt := action.UpdatedAt.UTC()
	if updatedAt.IsZero() {
		updatedAt = createdAt
		action.UpdatedAt = updatedAt
	}
	const q = `
INSERT INTO orchestration_tool_actions (
	tool_action_id, session_id, worker_id, tenant_id, project_id, tool_type, status, source, request_payload, result_payload, policy_decision, approval_checkpoint_id, audit_link, read_only, restricted_host_request, created_at, updated_at
) VALUES (
	$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
)
ON CONFLICT (tool_action_id) DO UPDATE SET
	session_id = EXCLUDED.session_id,
	worker_id = EXCLUDED.worker_id,
	tenant_id = EXCLUDED.tenant_id,
	project_id = EXCLUDED.project_id,
	tool_type = EXCLUDED.tool_type,
	status = EXCLUDED.status,
	source = EXCLUDED.source,
	request_payload = EXCLUDED.request_payload,
	result_payload = EXCLUDED.result_payload,
	policy_decision = EXCLUDED.policy_decision,
	approval_checkpoint_id = EXCLUDED.approval_checkpoint_id,
	audit_link = EXCLUDED.audit_link,
	read_only = EXCLUDED.read_only,
	restricted_host_request = EXCLUDED.restricted_host_request,
	updated_at = EXCLUDED.updated_at
`
	_, err := s.db.ExecContext(
		ctx,
		q,
		action.ToolActionID,
		action.SessionID,
		nullStr(action.WorkerID),
		action.TenantID,
		action.ProjectID,
		action.ToolType,
		string(action.Status),
		nullStr(action.Source),
		jsonBytesOrEmptyObject(action.RequestPayload),
		jsonBytesOrEmptyObject(action.ResultPayload),
		nullStr(action.PolicyDecision),
		nullStr(action.ApprovalCheckpointID),
		jsonBytesOrEmptyObject(action.AuditLink),
		action.ReadOnly,
		action.RestrictedHostRequest,
		createdAt,
		updatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert tool action %s: %w", action.ToolActionID, err)
	}
	return nil
}

func (s *PostgresRunStore) ListToolActions(ctx context.Context, query ToolActionListQuery) ([]ToolActionRecord, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	base := `
SELECT
	tool_action_id,
	session_id,
	COALESCE(worker_id, ''),
	tenant_id,
	project_id,
	tool_type,
	status,
	COALESCE(source, ''),
	request_payload,
	result_payload,
	COALESCE(policy_decision, ''),
	COALESCE(approval_checkpoint_id, ''),
	audit_link,
	read_only,
	restricted_host_request,
	created_at,
	updated_at
FROM orchestration_tool_actions
`
	clauses := make([]string, 0, 8)
	args := make([]interface{}, 0, 10)
	appendArg := func(v interface{}) int {
		args = append(args, v)
		return len(args)
	}
	if q := strings.TrimSpace(query.SessionID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("session_id = $%d", i))
	}
	if q := strings.TrimSpace(query.TenantID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("tenant_id = $%d", i))
	}
	if q := strings.TrimSpace(query.ProjectID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("project_id = $%d", i))
	}
	if q := strings.TrimSpace(query.WorkerID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("worker_id = $%d", i))
	}
	if q := strings.TrimSpace(query.ToolType); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("tool_type = $%d", i))
	}
	if q := strings.TrimSpace(string(query.Status)); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("status = $%d", i))
	}
	sqlText := base
	if len(clauses) > 0 {
		sqlText += " WHERE " + strings.Join(clauses, " AND ")
	}
	limitIdx := appendArg(limit)
	sqlText += fmt.Sprintf(" ORDER BY created_at ASC LIMIT $%d", limitIdx)

	rows, err := s.db.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ToolActionRecord, 0, limit)
	for rows.Next() {
		var (
			item           ToolActionRecord
			status         string
			requestPayload []byte
			resultPayload  []byte
			auditLink      []byte
		)
		if err := rows.Scan(
			&item.ToolActionID,
			&item.SessionID,
			&item.WorkerID,
			&item.TenantID,
			&item.ProjectID,
			&item.ToolType,
			&status,
			&item.Source,
			&requestPayload,
			&resultPayload,
			&item.PolicyDecision,
			&item.ApprovalCheckpointID,
			&auditLink,
			&item.ReadOnly,
			&item.RestrictedHostRequest,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.Status = ToolActionStatus(status)
		item.RequestPayload = requestPayload
		item.ResultPayload = resultPayload
		item.AuditLink = auditLink
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *PostgresRunStore) AppendSessionEvent(ctx context.Context, event *SessionEventRecord) error {
	if event == nil {
		return fmt.Errorf("session event record is required")
	}
	event.SessionID = strings.TrimSpace(event.SessionID)
	if event.SessionID == "" {
		return fmt.Errorf("sessionId is required")
	}
	if strings.TrimSpace(string(event.EventType)) == "" {
		return fmt.Errorf("eventType is required")
	}
	if event.Timestamp.UTC().IsZero() {
		event.Timestamp = time.Now().UTC()
	} else {
		event.Timestamp = event.Timestamp.UTC()
	}
	if event.Sequence <= 0 {
		const nextSeqQ = `SELECT COALESCE(MAX(sequence), 0) + 1 FROM orchestration_session_events WHERE session_id = $1`
		if err := s.db.QueryRowContext(ctx, nextSeqQ, event.SessionID).Scan(&event.Sequence); err != nil {
			return fmt.Errorf("lookup next event sequence: %w", err)
		}
	}
	if strings.TrimSpace(event.EventID) == "" {
		event.EventID = fmt.Sprintf("%s-event-%d", event.SessionID, event.Sequence)
	}
	const q = `
INSERT INTO orchestration_session_events (
	event_id, session_id, sequence, event_type, payload, created_at
) VALUES ($1,$2,$3,$4,$5,$6)
ON CONFLICT (event_id) DO UPDATE SET
	session_id = EXCLUDED.session_id,
	sequence = EXCLUDED.sequence,
	event_type = EXCLUDED.event_type,
	payload = EXCLUDED.payload,
	created_at = EXCLUDED.created_at
`
	_, err := s.db.ExecContext(
		ctx,
		q,
		event.EventID,
		event.SessionID,
		event.Sequence,
		string(event.EventType),
		jsonBytesOrEmptyObject(event.Payload),
		event.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("append session event %s: %w", event.EventID, err)
	}
	return nil
}

func (s *PostgresRunStore) ListSessionEvents(ctx context.Context, query SessionEventListQuery) ([]SessionEventRecord, error) {
	sessionID := strings.TrimSpace(query.SessionID)
	if sessionID == "" {
		return nil, fmt.Errorf("sessionId is required")
	}
	limit := query.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}
	base := `
SELECT event_id, session_id, sequence, event_type, payload, created_at
FROM orchestration_session_events
WHERE session_id = $1
`
	args := []interface{}{sessionID}
	if query.AfterSequence > 0 {
		args = append(args, query.AfterSequence)
		base += fmt.Sprintf(" AND sequence > $%d", len(args))
	}
	args = append(args, limit)
	base += fmt.Sprintf(" ORDER BY sequence ASC LIMIT $%d", len(args))

	rows, err := s.db.QueryContext(ctx, base, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]SessionEventRecord, 0, limit)
	for rows.Next() {
		var (
			item      SessionEventRecord
			eventType string
			payload   []byte
		)
		if err := rows.Scan(
			&item.EventID,
			&item.SessionID,
			&item.Sequence,
			&eventType,
			&payload,
			&item.Timestamp,
		); err != nil {
			return nil, err
		}
		item.EventType = SessionEventType(eventType)
		item.Payload = payload
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *PostgresRunStore) UpsertApprovalCheckpoint(ctx context.Context, checkpoint *ApprovalCheckpointRecord) error {
	if checkpoint == nil {
		return fmt.Errorf("approval checkpoint record is required")
	}
	checkpoint.CheckpointID = strings.TrimSpace(checkpoint.CheckpointID)
	checkpoint.SessionID = strings.TrimSpace(checkpoint.SessionID)
	checkpoint.LegacyRunID = strings.TrimSpace(checkpoint.LegacyRunID)
	checkpoint.RequestID = strings.TrimSpace(checkpoint.RequestID)
	checkpoint.TenantID = strings.TrimSpace(checkpoint.TenantID)
	checkpoint.ProjectID = strings.TrimSpace(checkpoint.ProjectID)
	checkpoint.Scope = strings.TrimSpace(checkpoint.Scope)
	checkpoint.TargetOS = strings.TrimSpace(checkpoint.TargetOS)
	checkpoint.TargetExecutionProfile = strings.TrimSpace(checkpoint.TargetExecutionProfile)
	checkpoint.Reason = strings.TrimSpace(checkpoint.Reason)
	if checkpoint.CheckpointID == "" {
		return fmt.Errorf("checkpointId is required")
	}
	if checkpoint.SessionID == "" {
		return fmt.Errorf("sessionId is required")
	}
	if checkpoint.TenantID == "" || checkpoint.ProjectID == "" {
		return fmt.Errorf("approval checkpoint tenantId and projectId are required")
	}
	if strings.TrimSpace(string(checkpoint.Status)) == "" {
		checkpoint.Status = ApprovalStatusPending
	}
	createdAt := checkpoint.CreatedAt.UTC()
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
		checkpoint.CreatedAt = createdAt
	}
	updatedAt := checkpoint.UpdatedAt.UTC()
	if updatedAt.IsZero() {
		updatedAt = createdAt
		checkpoint.UpdatedAt = updatedAt
	}
	requiredVerifierIDs, _ := json.Marshal(normalizeStringList(checkpoint.RequiredVerifierIDs))
	requestedCapabilities, _ := json.Marshal(normalizeStringList(checkpoint.RequestedCapabilities))
	const q = `
INSERT INTO orchestration_approval_checkpoints (
	checkpoint_id, session_id, legacy_run_id, request_id, tenant_id, project_id, scope, tier, target_os, target_execution_profile, requested_capabilities, required_verifier_ids, status, reason, created_at, expires_at, reviewed_at, updated_at
) VALUES (
	$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
)
ON CONFLICT (checkpoint_id) DO UPDATE SET
	session_id = EXCLUDED.session_id,
	legacy_run_id = EXCLUDED.legacy_run_id,
	request_id = EXCLUDED.request_id,
	tenant_id = EXCLUDED.tenant_id,
	project_id = EXCLUDED.project_id,
	scope = EXCLUDED.scope,
	tier = EXCLUDED.tier,
	target_os = EXCLUDED.target_os,
	target_execution_profile = EXCLUDED.target_execution_profile,
	requested_capabilities = EXCLUDED.requested_capabilities,
	required_verifier_ids = EXCLUDED.required_verifier_ids,
	status = EXCLUDED.status,
	reason = EXCLUDED.reason,
	expires_at = EXCLUDED.expires_at,
	reviewed_at = EXCLUDED.reviewed_at,
	updated_at = EXCLUDED.updated_at
`
	_, err := s.db.ExecContext(
		ctx,
		q,
		checkpoint.CheckpointID,
		checkpoint.SessionID,
		nullStr(checkpoint.LegacyRunID),
		nullStr(checkpoint.RequestID),
		checkpoint.TenantID,
		checkpoint.ProjectID,
		nullStr(checkpoint.Scope),
		checkpoint.Tier,
		nullStr(checkpoint.TargetOS),
		nullStr(checkpoint.TargetExecutionProfile),
		requestedCapabilities,
		requiredVerifierIDs,
		string(checkpoint.Status),
		nullStr(checkpoint.Reason),
		createdAt,
		nullTime(checkpoint.ExpiresAt),
		nullTime(checkpoint.ReviewedAt),
		updatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert approval checkpoint %s: %w", checkpoint.CheckpointID, err)
	}
	return nil
}

func (s *PostgresRunStore) ListApprovalCheckpoints(ctx context.Context, query ApprovalCheckpointListQuery) ([]ApprovalCheckpointRecord, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	base := `
SELECT
	checkpoint_id,
	session_id,
	COALESCE(legacy_run_id, ''),
	COALESCE(request_id, ''),
	tenant_id,
	project_id,
	COALESCE(scope, ''),
	tier,
	COALESCE(target_os, ''),
	COALESCE(target_execution_profile, ''),
	requested_capabilities,
	required_verifier_ids,
	status,
	COALESCE(reason, ''),
	created_at,
	expires_at,
	reviewed_at,
	updated_at
FROM orchestration_approval_checkpoints
`
	clauses := make([]string, 0, 6)
	args := make([]interface{}, 0, 8)
	appendArg := func(v interface{}) int {
		args = append(args, v)
		return len(args)
	}
	if q := strings.TrimSpace(query.CheckpointID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("checkpoint_id = $%d", i))
	}
	if q := strings.TrimSpace(query.SessionID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("session_id = $%d", i))
	}
	if q := strings.TrimSpace(query.TenantID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("tenant_id = $%d", i))
	}
	if q := strings.TrimSpace(query.ProjectID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("project_id = $%d", i))
	}
	if q := strings.TrimSpace(string(query.Status)); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("status = $%d", i))
	}
	sqlText := base
	if len(clauses) > 0 {
		sqlText += " WHERE " + strings.Join(clauses, " AND ")
	}
	limitIdx := appendArg(limit)
	sqlText += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d", limitIdx)

	rows, err := s.db.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ApprovalCheckpointRecord, 0, limit)
	for rows.Next() {
		var (
			item                ApprovalCheckpointRecord
			status              string
			requestedCapsRaw    []byte
			requiredVerifierRaw []byte
			expiresAt           sql.NullTime
			reviewedAt          sql.NullTime
		)
		if err := rows.Scan(
			&item.CheckpointID,
			&item.SessionID,
			&item.LegacyRunID,
			&item.RequestID,
			&item.TenantID,
			&item.ProjectID,
			&item.Scope,
			&item.Tier,
			&item.TargetOS,
			&item.TargetExecutionProfile,
			&requestedCapsRaw,
			&requiredVerifierRaw,
			&status,
			&item.Reason,
			&item.CreatedAt,
			&expiresAt,
			&reviewedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.Status = ApprovalStatus(status)
		_ = json.Unmarshal(requestedCapsRaw, &item.RequestedCapabilities)
		_ = json.Unmarshal(requiredVerifierRaw, &item.RequiredVerifierIDs)
		if expiresAt.Valid {
			t := expiresAt.Time.UTC()
			item.ExpiresAt = &t
		}
		if reviewedAt.Valid {
			t := reviewedAt.Time.UTC()
			item.ReviewedAt = &t
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *PostgresRunStore) UpsertEvidenceRecord(ctx context.Context, record *EvidenceRecord) error {
	if record == nil {
		return fmt.Errorf("evidence record is required")
	}
	record.EvidenceID = strings.TrimSpace(record.EvidenceID)
	record.SessionID = strings.TrimSpace(record.SessionID)
	record.ToolActionID = strings.TrimSpace(record.ToolActionID)
	record.CheckpointID = strings.TrimSpace(record.CheckpointID)
	record.TenantID = strings.TrimSpace(record.TenantID)
	record.ProjectID = strings.TrimSpace(record.ProjectID)
	record.Kind = strings.TrimSpace(record.Kind)
	record.URI = strings.TrimSpace(record.URI)
	record.Checksum = strings.TrimSpace(record.Checksum)
	record.RetentionClass = strings.TrimSpace(record.RetentionClass)
	if record.EvidenceID == "" {
		return fmt.Errorf("evidenceId is required")
	}
	if record.SessionID == "" {
		return fmt.Errorf("sessionId is required")
	}
	if record.TenantID == "" || record.ProjectID == "" {
		return fmt.Errorf("evidence record tenantId and projectId are required")
	}
	if record.Kind == "" {
		return fmt.Errorf("kind is required")
	}
	createdAt := record.CreatedAt.UTC()
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
		record.CreatedAt = createdAt
	}
	updatedAt := record.UpdatedAt.UTC()
	if updatedAt.IsZero() {
		updatedAt = createdAt
		record.UpdatedAt = updatedAt
	}
	const q = `
INSERT INTO orchestration_evidence_records (
	evidence_id, session_id, tool_action_id, checkpoint_id, tenant_id, project_id, kind, uri, checksum, metadata, retention_class, created_at, updated_at
) VALUES (
	$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
)
ON CONFLICT (evidence_id) DO UPDATE SET
	session_id = EXCLUDED.session_id,
	tool_action_id = EXCLUDED.tool_action_id,
	checkpoint_id = EXCLUDED.checkpoint_id,
	tenant_id = EXCLUDED.tenant_id,
	project_id = EXCLUDED.project_id,
	kind = EXCLUDED.kind,
	uri = EXCLUDED.uri,
	checksum = EXCLUDED.checksum,
	metadata = EXCLUDED.metadata,
	retention_class = EXCLUDED.retention_class,
	updated_at = EXCLUDED.updated_at
`
	_, err := s.db.ExecContext(
		ctx,
		q,
		record.EvidenceID,
		record.SessionID,
		nullStr(record.ToolActionID),
		nullStr(record.CheckpointID),
		record.TenantID,
		record.ProjectID,
		record.Kind,
		nullStr(record.URI),
		nullStr(record.Checksum),
		jsonBytesOrEmptyObject(record.Metadata),
		nullStr(record.RetentionClass),
		createdAt,
		updatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert evidence record %s: %w", record.EvidenceID, err)
	}
	return nil
}

func (s *PostgresRunStore) ListEvidenceRecords(ctx context.Context, query EvidenceRecordListQuery) ([]EvidenceRecord, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	base := `
SELECT
	evidence_id,
	session_id,
	COALESCE(tool_action_id, ''),
	COALESCE(checkpoint_id, ''),
	tenant_id,
	project_id,
	kind,
	COALESCE(uri, ''),
	COALESCE(checksum, ''),
	metadata,
	COALESCE(retention_class, ''),
	created_at,
	updated_at
FROM orchestration_evidence_records
`
	clauses := make([]string, 0, 8)
	args := make([]interface{}, 0, 10)
	appendArg := func(v interface{}) int {
		args = append(args, v)
		return len(args)
	}
	if q := strings.TrimSpace(query.SessionID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("session_id = $%d", i))
	}
	if q := strings.TrimSpace(query.TenantID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("tenant_id = $%d", i))
	}
	if q := strings.TrimSpace(query.ProjectID); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("project_id = $%d", i))
	}
	if q := strings.TrimSpace(query.Kind); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("kind = $%d", i))
	}
	if q := strings.TrimSpace(query.RetentionClass); q != "" {
		i := appendArg(q)
		clauses = append(clauses, fmt.Sprintf("retention_class = $%d", i))
	}
	sqlText := base
	if len(clauses) > 0 {
		sqlText += " WHERE " + strings.Join(clauses, " AND ")
	}
	limitIdx := appendArg(limit)
	sqlText += fmt.Sprintf(" ORDER BY created_at ASC LIMIT $%d", limitIdx)

	rows, err := s.db.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]EvidenceRecord, 0, limit)
	for rows.Next() {
		var (
			item     EvidenceRecord
			metadata []byte
		)
		if err := rows.Scan(
			&item.EvidenceID,
			&item.SessionID,
			&item.ToolActionID,
			&item.CheckpointID,
			&item.TenantID,
			&item.ProjectID,
			&item.Kind,
			&item.URI,
			&item.Checksum,
			&metadata,
			&item.RetentionClass,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.Metadata = metadata
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}
