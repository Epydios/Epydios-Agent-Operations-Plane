package runtime

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

type RunStore interface {
	Ping(context.Context) error
	EnsureSchema(context.Context) error
	UpsertRun(context.Context, *RunRecord) error
	GetRun(context.Context, string) (*RunRecord, error)
	ListRuns(context.Context, RunListQuery) ([]RunSummary, error)
	PruneRuns(context.Context, RunPruneQuery) (*RunPruneResult, error)
	UpsertIntegrationSettings(context.Context, *IntegrationSettingsRecord) error
	GetIntegrationSettings(context.Context, string, string) (*IntegrationSettingsRecord, error)
}

type PostgresRunStore struct {
	db *sql.DB
}

func NewPostgresRunStore(db *sql.DB) *PostgresRunStore {
	return &PostgresRunStore{db: db}
}

func (s *PostgresRunStore) Ping(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

func (s *PostgresRunStore) EnsureSchema(ctx context.Context) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS orchestration_runs (
			run_id TEXT PRIMARY KEY,
			request_id TEXT NOT NULL,
			tenant_id TEXT,
			project_id TEXT,
			environment TEXT,
			retention_class TEXT,
			expires_at TIMESTAMPTZ,
			status TEXT NOT NULL,
			selected_profile_provider TEXT,
			selected_policy_provider TEXT,
			selected_evidence_provider TEXT,
			selected_desktop_provider TEXT,
			policy_decision TEXT,
			policy_bundle_id TEXT,
			policy_bundle_version TEXT,
			policy_grant_token_present BOOLEAN NOT NULL DEFAULT FALSE,
			policy_grant_token_sha256 TEXT,
			request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
			profile_response JSONB,
			policy_response JSONB,
			desktop_observe_response JSONB,
			desktop_actuate_response JSONB,
			desktop_verify_response JSONB,
			evidence_record_response JSONB,
			evidence_bundle_response JSONB,
			error_message TEXT,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`,
		`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS policy_grant_token_present BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS policy_grant_token_sha256 TEXT`,
		`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS retention_class TEXT`,
		`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
		`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS policy_bundle_id TEXT`,
		`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS policy_bundle_version TEXT`,
		`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS selected_desktop_provider TEXT`,
		`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS desktop_observe_response JSONB`,
		`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS desktop_actuate_response JSONB`,
		`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS desktop_verify_response JSONB`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_runs_created_at ON orchestration_runs (created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_runs_status ON orchestration_runs (status)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_runs_scope ON orchestration_runs (tenant_id, project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_runs_expires_at ON orchestration_runs (expires_at)`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_runs_retention_class ON orchestration_runs (retention_class)`,
		`CREATE TABLE IF NOT EXISTS orchestration_integration_settings (
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			settings JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (tenant_id, project_id)
		)`,
		`ALTER TABLE orchestration_integration_settings ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb`,
		`ALTER TABLE orchestration_integration_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`ALTER TABLE orchestration_integration_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`CREATE INDEX IF NOT EXISTS idx_orchestration_integration_settings_updated_at ON orchestration_integration_settings (updated_at DESC)`,
	}

	for _, stmt := range stmts {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("ensure schema: %w", err)
		}
	}
	return nil
}

func (s *PostgresRunStore) UpsertRun(ctx context.Context, run *RunRecord) error {
	const q = `
INSERT INTO orchestration_runs (
	run_id,
	request_id,
	tenant_id,
	project_id,
	environment,
	retention_class,
	expires_at,
	status,
	selected_profile_provider,
	selected_policy_provider,
	selected_evidence_provider,
	selected_desktop_provider,
	policy_decision,
	policy_bundle_id,
	policy_bundle_version,
	policy_grant_token_present,
	policy_grant_token_sha256,
	request_payload,
	profile_response,
	policy_response,
	desktop_observe_response,
	desktop_actuate_response,
	desktop_verify_response,
	evidence_record_response,
	evidence_bundle_response,
	error_message,
	created_at,
	updated_at
) VALUES (
	$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
)
ON CONFLICT (run_id) DO UPDATE SET
	request_id = EXCLUDED.request_id,
	tenant_id = EXCLUDED.tenant_id,
	project_id = EXCLUDED.project_id,
	environment = EXCLUDED.environment,
	retention_class = EXCLUDED.retention_class,
	expires_at = EXCLUDED.expires_at,
	status = EXCLUDED.status,
	selected_profile_provider = EXCLUDED.selected_profile_provider,
	selected_policy_provider = EXCLUDED.selected_policy_provider,
	selected_evidence_provider = EXCLUDED.selected_evidence_provider,
	selected_desktop_provider = EXCLUDED.selected_desktop_provider,
	policy_decision = EXCLUDED.policy_decision,
	policy_bundle_id = EXCLUDED.policy_bundle_id,
	policy_bundle_version = EXCLUDED.policy_bundle_version,
	policy_grant_token_present = EXCLUDED.policy_grant_token_present,
	policy_grant_token_sha256 = EXCLUDED.policy_grant_token_sha256,
	request_payload = EXCLUDED.request_payload,
	profile_response = EXCLUDED.profile_response,
	policy_response = EXCLUDED.policy_response,
	desktop_observe_response = EXCLUDED.desktop_observe_response,
	desktop_actuate_response = EXCLUDED.desktop_actuate_response,
	desktop_verify_response = EXCLUDED.desktop_verify_response,
	evidence_record_response = EXCLUDED.evidence_record_response,
	evidence_bundle_response = EXCLUDED.evidence_bundle_response,
	error_message = EXCLUDED.error_message,
	updated_at = EXCLUDED.updated_at
`

	createdAt := run.CreatedAt.UTC()
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
		run.CreatedAt = createdAt
	}
	updatedAt := run.UpdatedAt.UTC()
	if updatedAt.IsZero() {
		updatedAt = createdAt
		run.UpdatedAt = updatedAt
	}

	_, err := s.db.ExecContext(
		ctx,
		q,
		run.RunID,
		run.RequestID,
		nullStr(run.TenantID),
		nullStr(run.ProjectID),
		nullStr(run.Environment),
		nullStr(run.RetentionClass),
		nullTime(run.ExpiresAt),
		string(run.Status),
		nullStr(run.SelectedProfileProvider),
		nullStr(run.SelectedPolicyProvider),
		nullStr(run.SelectedEvidenceProvider),
		nullStr(run.SelectedDesktopProvider),
		nullStr(run.PolicyDecision),
		nullStr(run.PolicyBundleID),
		nullStr(run.PolicyBundleVersion),
		run.PolicyGrantTokenPresent,
		nullStr(run.PolicyGrantTokenSHA256),
		jsonBytesOrEmptyObject(run.RequestPayload),
		nullJSON(run.ProfileResponse),
		nullJSON(run.PolicyResponse),
		nullJSON(run.DesktopObserveResponse),
		nullJSON(run.DesktopActuateResponse),
		nullJSON(run.DesktopVerifyResponse),
		nullJSON(run.EvidenceRecordResponse),
		nullJSON(run.EvidenceBundleResponse),
		nullStr(run.ErrorMessage),
		createdAt,
		updatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert run %s: %w", run.RunID, err)
	}
	return nil
}

func (s *PostgresRunStore) GetRun(ctx context.Context, runID string) (*RunRecord, error) {
	const q = `
SELECT
	run_id,
	request_id,
	COALESCE(tenant_id, ''),
	COALESCE(project_id, ''),
	COALESCE(environment, ''),
	COALESCE(retention_class, ''),
	expires_at,
	status,
	COALESCE(selected_profile_provider, ''),
	COALESCE(selected_policy_provider, ''),
	COALESCE(selected_evidence_provider, ''),
	COALESCE(selected_desktop_provider, ''),
	COALESCE(policy_decision, ''),
	COALESCE(policy_bundle_id, ''),
	COALESCE(policy_bundle_version, ''),
	COALESCE(policy_grant_token_present, FALSE),
	COALESCE(policy_grant_token_sha256, ''),
	request_payload,
	profile_response,
	policy_response,
	desktop_observe_response,
	desktop_actuate_response,
	desktop_verify_response,
	evidence_record_response,
	evidence_bundle_response,
	COALESCE(error_message, ''),
	created_at,
	updated_at
FROM orchestration_runs
WHERE run_id = $1
`

	var (
		rec       RunRecord
		status    string
		reqJSON   []byte
		pJSON     []byte
		polJSON   []byte
		doJSON    []byte
		daJSON    []byte
		dvJSON    []byte
		erJSON    []byte
		ebJSON    []byte
		expiresAt sql.NullTime
	)

	err := s.db.QueryRowContext(ctx, q, runID).Scan(
		&rec.RunID,
		&rec.RequestID,
		&rec.TenantID,
		&rec.ProjectID,
		&rec.Environment,
		&rec.RetentionClass,
		&expiresAt,
		&status,
		&rec.SelectedProfileProvider,
		&rec.SelectedPolicyProvider,
		&rec.SelectedEvidenceProvider,
		&rec.SelectedDesktopProvider,
		&rec.PolicyDecision,
		&rec.PolicyBundleID,
		&rec.PolicyBundleVersion,
		&rec.PolicyGrantTokenPresent,
		&rec.PolicyGrantTokenSHA256,
		&reqJSON,
		&pJSON,
		&polJSON,
		&doJSON,
		&daJSON,
		&dvJSON,
		&erJSON,
		&ebJSON,
		&rec.ErrorMessage,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	rec.Status = RunStatus(status)
	rec.RequestPayload = reqJSON
	rec.ProfileResponse = pJSON
	rec.PolicyResponse = polJSON
	rec.DesktopObserveResponse = doJSON
	rec.DesktopActuateResponse = daJSON
	rec.DesktopVerifyResponse = dvJSON
	rec.EvidenceRecordResponse = erJSON
	rec.EvidenceBundleResponse = ebJSON
	if expiresAt.Valid {
		t := expiresAt.Time.UTC()
		rec.ExpiresAt = &t
	}

	return &rec, nil
}

func (s *PostgresRunStore) ListRuns(ctx context.Context, query RunListQuery) ([]RunSummary, error) {
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
	if offset > 50000 {
		offset = 50000
	}

	base := `
SELECT
	run_id,
	request_id,
	COALESCE(tenant_id, ''),
	COALESCE(project_id, ''),
	COALESCE(environment, ''),
	COALESCE(retention_class, ''),
	expires_at,
	status,
	COALESCE(selected_profile_provider, ''),
	COALESCE(selected_policy_provider, ''),
	COALESCE(selected_evidence_provider, ''),
	COALESCE(selected_desktop_provider, ''),
	COALESCE(policy_decision, ''),
	COALESCE(policy_bundle_id, ''),
	COALESCE(policy_bundle_version, ''),
	COALESCE(policy_grant_token_present, FALSE),
	COALESCE(policy_grant_token_sha256, ''),
	created_at,
	updated_at
FROM orchestration_runs
`

	clauses := make([]string, 0, 12)
	args := make([]interface{}, 0, 20)
	appendArg := func(v interface{}) int {
		args = append(args, v)
		return len(args)
	}
	appendClause := func(clause string) {
		clauses = append(clauses, clause)
	}

	if query.TenantID != "" {
		i := appendArg(query.TenantID)
		appendClause(fmt.Sprintf("tenant_id = $%d", i))
	}
	if query.ProjectID != "" {
		i := appendArg(query.ProjectID)
		appendClause(fmt.Sprintf("project_id = $%d", i))
	}
	if query.Environment != "" {
		i := appendArg(query.Environment)
		appendClause(fmt.Sprintf("environment = $%d", i))
	}
	if query.Status != "" {
		i := appendArg(query.Status)
		appendClause(fmt.Sprintf("status = $%d", i))
	}
	if query.PolicyDecision != "" {
		i := appendArg(query.PolicyDecision)
		appendClause(fmt.Sprintf("policy_decision = $%d", i))
	}
	if query.ProviderID != "" {
		i := appendArg(query.ProviderID)
		appendClause(fmt.Sprintf("(selected_profile_provider = $%d OR selected_policy_provider = $%d OR selected_evidence_provider = $%d OR selected_desktop_provider = $%d)", i, i, i, i))
	}
	if query.RetentionClass != "" {
		i := appendArg(query.RetentionClass)
		appendClause(fmt.Sprintf("retention_class = $%d", i))
	}
	if query.CreatedAfter != nil {
		i := appendArg(query.CreatedAfter.UTC())
		appendClause(fmt.Sprintf("created_at >= $%d", i))
	}
	if query.CreatedBefore != nil {
		i := appendArg(query.CreatedBefore.UTC())
		appendClause(fmt.Sprintf("created_at <= $%d", i))
	}
	if query.Search != "" {
		i := appendArg("%" + query.Search + "%")
		appendClause(fmt.Sprintf("(run_id ILIKE $%d OR request_id ILIKE $%d OR COALESCE(tenant_id,'') ILIKE $%d OR COALESCE(project_id,'') ILIKE $%d)", i, i, i, i))
	}
	if !query.IncludeExpired {
		appendClause("(expires_at IS NULL OR expires_at > NOW())")
	}

	q := base
	if len(clauses) > 0 {
		q += " WHERE " + strings.Join(clauses, " AND ")
	}
	limitIdx := appendArg(limit)
	offsetIdx := appendArg(offset)
	q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", limitIdx, offsetIdx)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]RunSummary, 0, limit)
	for rows.Next() {
		var (
			item      RunSummary
			status    string
			expiresAt sql.NullTime
		)
		if err := rows.Scan(
			&item.RunID,
			&item.RequestID,
			&item.TenantID,
			&item.ProjectID,
			&item.Environment,
			&item.RetentionClass,
			&expiresAt,
			&status,
			&item.SelectedProfileProvider,
			&item.SelectedPolicyProvider,
			&item.SelectedEvidenceProvider,
			&item.SelectedDesktopProvider,
			&item.PolicyDecision,
			&item.PolicyBundleID,
			&item.PolicyBundleVersion,
			&item.PolicyGrantTokenPresent,
			&item.PolicyGrantTokenSHA256,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.Status = RunStatus(status)
		if expiresAt.Valid {
			t := expiresAt.Time.UTC()
			item.ExpiresAt = &t
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *PostgresRunStore) PruneRuns(ctx context.Context, query RunPruneQuery) (*RunPruneResult, error) {
	before := query.Before.UTC()
	if before.IsZero() {
		before = time.Now().UTC()
	}
	limit := query.Limit
	if limit <= 0 {
		limit = 500
	}
	if limit > 5000 {
		limit = 5000
	}

	result := &RunPruneResult{
		DryRun:         query.DryRun,
		Before:         before,
		RetentionClass: query.RetentionClass,
		Limit:          limit,
		RunIDs:         make([]string, 0, limit),
	}

	clauses := []string{"expires_at IS NOT NULL", "expires_at <= $1"}
	args := []interface{}{before}
	if query.RetentionClass != "" {
		args = append(args, query.RetentionClass)
		clauses = append(clauses, fmt.Sprintf("retention_class = $%d", len(args)))
	}
	args = append(args, limit)
	limitPos := len(args)

	selectQ := fmt.Sprintf(
		`SELECT run_id FROM orchestration_runs WHERE %s ORDER BY expires_at ASC LIMIT $%d`,
		strings.Join(clauses, " AND "),
		limitPos,
	)
	rows, err := s.db.QueryContext(ctx, selectQ, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var runID string
		if err := rows.Scan(&runID); err != nil {
			return nil, err
		}
		result.RunIDs = append(result.RunIDs, runID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	result.Matched = len(result.RunIDs)
	if query.DryRun || len(result.RunIDs) == 0 {
		return result, nil
	}

	delArgs := make([]interface{}, 0, len(result.RunIDs))
	placeholders := make([]string, 0, len(result.RunIDs))
	for _, runID := range result.RunIDs {
		delArgs = append(delArgs, runID)
		placeholders = append(placeholders, fmt.Sprintf("$%d", len(delArgs)))
	}
	delQ := fmt.Sprintf(`DELETE FROM orchestration_runs WHERE run_id IN (%s)`, strings.Join(placeholders, ","))
	res, err := s.db.ExecContext(ctx, delQ, delArgs...)
	if err != nil {
		return nil, err
	}
	affected, _ := res.RowsAffected()
	result.Deleted = int(affected)
	return result, nil
}

func (s *PostgresRunStore) UpsertIntegrationSettings(ctx context.Context, record *IntegrationSettingsRecord) error {
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

	const q = `
INSERT INTO orchestration_integration_settings (
	tenant_id,
	project_id,
	settings,
	created_at,
	updated_at
) VALUES ($1,$2,$3,$4,$5)
ON CONFLICT (tenant_id, project_id) DO UPDATE SET
	settings = EXCLUDED.settings,
	updated_at = EXCLUDED.updated_at
`

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

	_, err := s.db.ExecContext(
		ctx,
		q,
		tenantID,
		projectID,
		jsonBytesOrEmptyObject(record.Settings),
		createdAt,
		updatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert integration settings tenant=%s project=%s: %w", tenantID, projectID, err)
	}
	return nil
}

func (s *PostgresRunStore) GetIntegrationSettings(ctx context.Context, tenantID, projectID string) (*IntegrationSettingsRecord, error) {
	tenantID = strings.TrimSpace(tenantID)
	projectID = strings.TrimSpace(projectID)
	if tenantID == "" {
		return nil, fmt.Errorf("integration settings tenantId is required")
	}
	if projectID == "" {
		return nil, fmt.Errorf("integration settings projectId is required")
	}

	const q = `
SELECT
	tenant_id,
	project_id,
	settings,
	created_at,
	updated_at
FROM orchestration_integration_settings
WHERE tenant_id = $1 AND project_id = $2
`

	var (
		record      IntegrationSettingsRecord
		settingsRaw []byte
	)
	if err := s.db.QueryRowContext(ctx, q, tenantID, projectID).Scan(
		&record.TenantID,
		&record.ProjectID,
		&settingsRaw,
		&record.CreatedAt,
		&record.UpdatedAt,
	); err != nil {
		return nil, err
	}
	record.Settings = settingsRaw
	return &record, nil
}

func nullStr(v string) interface{} {
	if v == "" {
		return nil
	}
	return v
}

func nullJSON(v []byte) interface{} {
	if len(v) == 0 {
		return nil
	}
	return v
}

func nullTime(v *time.Time) interface{} {
	if v == nil {
		return nil
	}
	t := v.UTC()
	return t
}

func jsonBytesOrEmptyObject(v []byte) []byte {
	if len(v) == 0 {
		return []byte("{}")
	}
	return v
}
