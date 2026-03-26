package runtime

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
)

const (
	connectorDriverMCPSQLite            = "mcp_sqlite"
	connectorDriverMCPPostgres          = "mcp_postgres"
	connectorDriverMCPFilesystem        = "mcp_filesystem"
	connectorDriverMCPGitHub            = "mcp_github"
	connectorDriverMCPBrowser           = "mcp_browser"
	connectorToolQueryReadOnly          = "query_read_only"
	connectorToolReadText               = "read_text"
	connectorToolListDirectory          = "list_directory"
	connectorToolGetPullRequest         = "get_pull_request"
	connectorToolGetPageMetadata        = "get_page_metadata"
	connectorToolExtractText            = "extract_text"
	connectorToolClickDestructiveButton = "click_destructive_button"
)

type connectorProfileConfig struct {
	ID             string
	Label          string
	Driver         string
	DatabasePath   string
	ConnectionURI  string
	RootPath       string
	EndpointRef    string
	CredentialRef  string
	AllowedTools   []string
	AllowedOwners  []string
	AllowedRepos   []string
	AllowedOrigins []string
	Enabled        bool
}

type connectorIntegrationSettings struct {
	SelectedConnectorID string
	Profiles            []connectorProfileConfig
}

type rawConnectorProfileConfig struct {
	ID             string   `json:"id"`
	Label          string   `json:"label"`
	Driver         string   `json:"driver"`
	DatabasePath   string   `json:"databasePath"`
	ConnectionURI  string   `json:"connectionUri"`
	RootPath       string   `json:"rootPath"`
	EndpointRef    string   `json:"endpointRef"`
	CredentialRef  string   `json:"credentialRef"`
	AllowedTools   []string `json:"allowedTools"`
	AllowedOwners  []string `json:"allowedOwners"`
	AllowedRepos   []string `json:"allowedRepos"`
	AllowedOrigins []string `json:"allowedOrigins"`
	Enabled        *bool    `json:"enabled,omitempty"`
}

type rawConnectorIntegrationSettings struct {
	SelectedConnectorID string                      `json:"selectedConnectorId"`
	Profiles            []rawConnectorProfileConfig `json:"profiles"`
}

func defaultConnectorIntegrationSettings() connectorIntegrationSettings {
	return connectorIntegrationSettings{}
}

func parseConnectorIntegrationSettings(raw json.RawMessage) (connectorIntegrationSettings, error) {
	settings := defaultConnectorIntegrationSettings()
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "" || strings.TrimSpace(string(raw)) == "{}" {
		return settings, nil
	}

	var decoded rawConnectorIntegrationSettings
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return connectorIntegrationSettings{}, fmt.Errorf("decode connector settings: %w", err)
	}

	profiles := make([]connectorProfileConfig, 0, len(decoded.Profiles))
	for _, item := range decoded.Profiles {
		normalized := normalizeConnectorProfile(connectorProfileConfig{
			ID:             item.ID,
			Label:          item.Label,
			Driver:         item.Driver,
			DatabasePath:   item.DatabasePath,
			ConnectionURI:  item.ConnectionURI,
			RootPath:       item.RootPath,
			EndpointRef:    item.EndpointRef,
			CredentialRef:  item.CredentialRef,
			AllowedTools:   append([]string(nil), item.AllowedTools...),
			AllowedOwners:  append([]string(nil), item.AllowedOwners...),
			AllowedRepos:   append([]string(nil), item.AllowedRepos...),
			AllowedOrigins: append([]string(nil), item.AllowedOrigins...),
			Enabled:        true,
		})
		if item.Enabled != nil {
			normalized.Enabled = *item.Enabled
		}
		if normalized.ID == "" {
			continue
		}
		profiles = append(profiles, normalized)
	}
	settings.Profiles = profiles
	settings.SelectedConnectorID = strings.ToLower(strings.TrimSpace(decoded.SelectedConnectorID))
	if settings.SelectedConnectorID == "" && len(settings.Profiles) == 1 {
		settings.SelectedConnectorID = settings.Profiles[0].ID
	}
	if settings.SelectedConnectorID != "" {
		if _, err := settings.resolveProfile(settings.SelectedConnectorID); err != nil {
			return connectorIntegrationSettings{}, err
		}
	}
	return settings, nil
}

func normalizeConnectorProfile(in connectorProfileConfig) connectorProfileConfig {
	out := connectorProfileConfig{
		ID:             strings.ToLower(strings.TrimSpace(in.ID)),
		Label:          strings.TrimSpace(in.Label),
		Driver:         strings.ToLower(strings.TrimSpace(in.Driver)),
		DatabasePath:   strings.TrimSpace(in.DatabasePath),
		ConnectionURI:  strings.TrimSpace(in.ConnectionURI),
		RootPath:       strings.TrimSpace(in.RootPath),
		EndpointRef:    strings.TrimSpace(in.EndpointRef),
		CredentialRef:  strings.TrimSpace(in.CredentialRef),
		AllowedTools:   normalizeConnectorToolList(in.AllowedTools),
		AllowedOwners:  normalizeConnectorScopeList(in.AllowedOwners),
		AllowedRepos:   normalizeConnectorScopeList(in.AllowedRepos),
		AllowedOrigins: normalizeConnectorOriginList(in.AllowedOrigins),
		Enabled:        in.Enabled,
	}
	if out.Driver == "" {
		out.Driver = connectorDriverMCPSQLite
	}
	if out.Label == "" {
		out.Label = out.ID
	}
	if len(out.AllowedTools) == 0 {
		out.AllowedTools = defaultConnectorAllowedTools(out.Driver)
	}
	return out
}

func defaultConnectorAllowedTools(driver string) []string {
	switch strings.ToLower(strings.TrimSpace(driver)) {
	case connectorDriverMCPSQLite, connectorDriverMCPPostgres:
		return []string{connectorToolQueryReadOnly}
	case connectorDriverMCPFilesystem:
		return []string{connectorToolReadText, connectorToolListDirectory}
	case connectorDriverMCPGitHub:
		return []string{connectorToolGetPullRequest}
	case connectorDriverMCPBrowser:
		return []string{connectorToolGetPageMetadata, connectorToolExtractText, connectorToolClickDestructiveButton}
	default:
		return nil
	}
}

func normalizeConnectorToolList(values []string) []string {
	return normalizeConnectorScopeList(values)
}

func normalizeConnectorScopeList(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		normalized := strings.ToLower(strings.TrimSpace(value))
		if normalized == "" {
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

func (s connectorIntegrationSettings) resolveProfile(profileID string) (connectorProfileConfig, error) {
	resolvedID := strings.ToLower(strings.TrimSpace(profileID))
	if resolvedID == "" {
		resolvedID = strings.ToLower(strings.TrimSpace(s.SelectedConnectorID))
	}
	if resolvedID == "" {
		return connectorProfileConfig{}, fmt.Errorf("selected connector profile is required")
	}
	for _, item := range s.Profiles {
		if item.ID == resolvedID {
			return item, nil
		}
	}
	return connectorProfileConfig{}, fmt.Errorf("connector profile %q is not configured", resolvedID)
}

func loadConnectorIntegrationSettings(ctx context.Context, store RunStore, tenantID, projectID string) (connectorIntegrationSettings, error) {
	record, _, err := loadConnectorSettingsRecord(ctx, store, tenantID, projectID)
	if err != nil {
		return connectorIntegrationSettings{}, err
	}
	if record == nil {
		return defaultConnectorIntegrationSettings(), nil
	}
	return parseConnectorIntegrationSettings(record.Settings)
}

func loadConnectorSettingsRecord(ctx context.Context, store RunStore, tenantID, projectID string) (*ConnectorSettingsRecord, string, error) {
	if store == nil {
		return nil, "", fmt.Errorf("run store is not configured")
	}

	record, err := store.GetConnectorSettings(ctx, tenantID, projectID)
	if err == nil {
		settingsJSON, normalizeErr := normalizeConnectorSettingsJSON(record.Settings)
		if normalizeErr != nil {
			return nil, "", fmt.Errorf("decode connector settings: %w", normalizeErr)
		}
		out := *record
		out.Settings = settingsJSON
		return &out, "connector-store", nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) && !strings.Contains(strings.ToLower(err.Error()), "no rows") {
		return nil, "", fmt.Errorf("load connector settings: %w", err)
	}

	legacyRecord, legacyErr := store.GetIntegrationSettings(ctx, tenantID, projectID)
	if legacyErr != nil {
		if errors.Is(legacyErr, sql.ErrNoRows) || strings.Contains(strings.ToLower(legacyErr.Error()), "no rows") {
			return nil, "", nil
		}
		return nil, "", fmt.Errorf("load legacy connector settings: %w", legacyErr)
	}
	settingsJSON, hasSettings, extractErr := extractConnectorSettingsJSON(legacyRecord.Settings)
	if extractErr != nil {
		return nil, "", fmt.Errorf("extract legacy connector settings: %w", extractErr)
	}
	if !hasSettings {
		return nil, "", nil
	}
	return &ConnectorSettingsRecord{
		TenantID:  legacyRecord.TenantID,
		ProjectID: legacyRecord.ProjectID,
		Settings:  settingsJSON,
		CreatedAt: legacyRecord.CreatedAt,
		UpdatedAt: legacyRecord.UpdatedAt,
	}, "integration-store-compat", nil
}

func normalizeConnectorSettingsJSON(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		return []byte("{}"), nil
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}
	normalized, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return normalized, nil
}

func extractConnectorSettingsJSON(raw json.RawMessage) (json.RawMessage, bool, error) {
	normalized, err := normalizeIntegrationSettingsJSON(raw)
	if err != nil {
		return nil, false, err
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(normalized, &payload); err != nil {
		return nil, false, err
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}
	value, ok := payload["connectors"]
	if !ok || value == nil {
		return []byte("{}"), false, nil
	}
	connectorJSON, err := json.Marshal(value)
	if err != nil {
		return nil, false, err
	}
	connectorJSON, err = normalizeConnectorSettingsJSON(connectorJSON)
	if err != nil {
		return nil, false, err
	}
	return connectorJSON, connectorSettingsKeyCount(connectorJSON) > 0, nil
}

func mergeConnectorSettingsJSON(existingFull, connectorRaw json.RawMessage) (json.RawMessage, error) {
	normalized, err := normalizeIntegrationSettingsJSON(existingFull)
	if err != nil {
		return nil, err
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(normalized, &payload); err != nil {
		return nil, err
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}
	connectorJSON, err := normalizeConnectorSettingsJSON(connectorRaw)
	if err != nil {
		return nil, err
	}
	var connectors map[string]interface{}
	if err := json.Unmarshal(connectorJSON, &connectors); err != nil {
		return nil, err
	}
	if len(connectors) == 0 {
		delete(payload, "connectors")
	} else {
		payload["connectors"] = connectors
	}
	return json.Marshal(payload)
}

func validateConnectorSettingsJSON(raw json.RawMessage) []string {
	settings, err := parseConnectorIntegrationSettings(raw)
	if err != nil {
		return []string{err.Error()}
	}
	errs := make([]string, 0, 8)
	seen := make(map[string]struct{}, len(settings.Profiles))
	for idx, profile := range settings.Profiles {
		path := fmt.Sprintf("settings.profiles[%d]", idx)
		if profile.ID == "" {
			errs = append(errs, path+".id is required.")
		}
		if _, ok := seen[profile.ID]; ok && profile.ID != "" {
			errs = append(errs, path+".id must be unique.")
		}
		seen[profile.ID] = struct{}{}
		switch profile.Driver {
		case connectorDriverMCPSQLite:
			if strings.TrimSpace(profile.DatabasePath) == "" {
				errs = append(errs, path+".databasePath is required.")
			} else if !filepath.IsAbs(profile.DatabasePath) {
				errs = append(errs, path+".databasePath must be an absolute path.")
			}
		case connectorDriverMCPPostgres:
			if strings.TrimSpace(profile.ConnectionURI) == "" {
				errs = append(errs, path+".connectionUri is required.")
			} else if err := validatePostgresConnectionURI(profile.ConnectionURI); err != nil {
				errs = append(errs, path+".connectionUri "+err.Error())
			}
		case connectorDriverMCPFilesystem:
			if strings.TrimSpace(profile.RootPath) == "" {
				errs = append(errs, path+".rootPath is required.")
			} else if !filepath.IsAbs(profile.RootPath) {
				errs = append(errs, path+".rootPath must be an absolute path.")
			}
		case connectorDriverMCPGitHub:
			if strings.TrimSpace(profile.CredentialRef) == "" {
				errs = append(errs, path+".credentialRef is required.")
			} else if looksLikeRawIntegrationSecret(profile.CredentialRef) {
				errs = append(errs, path+".credentialRef looks like raw secret material; use a ref:// pointer instead.")
			} else if !strings.HasPrefix(profile.CredentialRef, "ref://") {
				errs = append(errs, path+".credentialRef must use ref:// format.")
			}
			if strings.TrimSpace(profile.EndpointRef) != "" {
				if looksLikeRawIntegrationSecret(profile.EndpointRef) {
					errs = append(errs, path+".endpointRef looks like raw secret material; use a ref:// pointer instead.")
				} else if !strings.HasPrefix(profile.EndpointRef, "ref://") {
					errs = append(errs, path+".endpointRef must use ref:// format.")
				}
			}
			if len(profile.AllowedOwners) == 0 && len(profile.AllowedRepos) == 0 {
				errs = append(errs, path+".allowedOwners or "+path+".allowedRepos must include at least one bounded GitHub scope.")
			}
		case connectorDriverMCPBrowser:
			if len(profile.AllowedOrigins) == 0 {
				errs = append(errs, path+".allowedOrigins must include at least one bounded browser origin.")
			}
			for originIdx, origin := range profile.AllowedOrigins {
				if _, err := normalizeConnectorBrowserOrigin(origin); err != nil {
					errs = append(errs, fmt.Sprintf("%s.allowedOrigins[%d] %s", path, originIdx, err.Error()))
				}
			}
		default:
			errs = append(errs, path+".driver must be mcp_sqlite, mcp_postgres, mcp_filesystem, mcp_github, or mcp_browser.")
		}
		if len(profile.AllowedTools) == 0 {
			switch profile.Driver {
			case connectorDriverMCPFilesystem:
				errs = append(errs, path+".allowedTools must include read_text or list_directory.")
			case connectorDriverMCPGitHub:
				errs = append(errs, path+".allowedTools must include get_pull_request.")
			case connectorDriverMCPBrowser:
				errs = append(errs, path+".allowedTools must include get_page_metadata, extract_text, or click_destructive_button.")
			default:
				errs = append(errs, path+".allowedTools must include query_read_only.")
			}
		}
		for toolIdx, toolName := range profile.AllowedTools {
			switch profile.Driver {
			case connectorDriverMCPFilesystem:
				if toolName != connectorToolReadText && toolName != connectorToolListDirectory {
					errs = append(errs, fmt.Sprintf("%s.allowedTools[%d] must be read_text or list_directory.", path, toolIdx))
				}
			case connectorDriverMCPGitHub:
				if toolName != connectorToolGetPullRequest {
					errs = append(errs, fmt.Sprintf("%s.allowedTools[%d] must be get_pull_request.", path, toolIdx))
				}
			case connectorDriverMCPBrowser:
				if toolName != connectorToolGetPageMetadata && toolName != connectorToolExtractText && toolName != connectorToolClickDestructiveButton {
					errs = append(errs, fmt.Sprintf("%s.allowedTools[%d] must be get_page_metadata, extract_text, or click_destructive_button.", path, toolIdx))
				}
			default:
				if toolName != connectorToolQueryReadOnly {
					errs = append(errs, fmt.Sprintf("%s.allowedTools[%d] must be query_read_only.", path, toolIdx))
				}
			}
		}
	}
	if settings.SelectedConnectorID != "" {
		if _, err := settings.resolveProfile(settings.SelectedConnectorID); err != nil {
			errs = append(errs, err.Error())
		}
	}
	return errs
}

func connectorSettingsKeyCount(raw json.RawMessage) int {
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return 0
	}
	return len(payload)
}

func validatePostgresConnectionURI(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("must be a valid postgres URI")
	}
	scheme := strings.ToLower(strings.TrimSpace(parsed.Scheme))
	if scheme != "postgres" && scheme != "postgresql" {
		return fmt.Errorf("must use postgres:// or postgresql:// format.")
	}
	if strings.TrimSpace(parsed.Hostname()) == "" {
		return fmt.Errorf("must include a hostname.")
	}
	if dbName := strings.Trim(strings.TrimSpace(parsed.Path), "/"); dbName == "" {
		return fmt.Errorf("must include a database path.")
	}
	return nil
}
