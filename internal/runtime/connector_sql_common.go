package runtime

import (
	"encoding/json"
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var (
	sqlMutationPattern = regexp.MustCompile(`(?i)\b(insert|update|delete|drop|alter|attach|detach|vacuum|replace|create|reindex|analyze|truncate)\b`)
	sqlTablePattern    = regexp.MustCompile(`(?i)\b(from|join|update|into)\s+([a-zA-Z_][a-zA-Z0-9_\.]*)`)
	sqlLimitPattern    = regexp.MustCompile(`(?i)\blimit\s+([0-9]+)\b`)
)

type sqlQueryClassification struct {
	StatementClass   string
	PrimaryVerb      string
	ReadOnly         bool
	QueryFingerprint string
	TargetTables     []string
	RowLimit         int
	Reason           string
}

func classifyConnectorQuery(query, driver string) sqlQueryClassification {
	switch strings.ToLower(strings.TrimSpace(driver)) {
	case connectorDriverMCPPostgres:
		return classifyPostgresQuery(query)
	case connectorDriverMCPSQLite, "":
		return classifySQLiteQuery(query)
	default:
		return classifyGenericSQLQuery(query)
	}
}

func classifySQLiteQuery(query string) sqlQueryClassification {
	return classifySQLQueryForDialect(query, connectorDriverMCPSQLite)
}

func classifyPostgresQuery(query string) sqlQueryClassification {
	return classifySQLQueryForDialect(query, connectorDriverMCPPostgres)
}

func classifyGenericSQLQuery(query string) sqlQueryClassification {
	return classifySQLQueryForDialect(query, "")
}

func classifySQLQueryForDialect(query, driver string) sqlQueryClassification {
	normalized := strings.TrimSpace(query)
	fingerprint := "sha256:" + sha256Hex(normalized)
	if normalized == "" {
		return sqlQueryClassification{
			StatementClass:   "invalid",
			QueryFingerprint: fingerprint,
			Reason:           "query is required",
		}
	}
	if sqlMutationPattern.MatchString(normalized) {
		return sqlQueryClassification{
			StatementClass:   "mutation",
			PrimaryVerb:      strings.ToLower(extractLeadingSQLVerb(normalized)),
			QueryFingerprint: fingerprint,
			TargetTables:     extractSQLTargetTables(normalized),
			RowLimit:         extractSQLRowLimit(normalized),
			Reason:           "mutation SQL is not allowed in the bounded read-only connector path",
		}
	}

	verb := strings.ToLower(extractLeadingSQLVerb(normalized))
	classification := sqlQueryClassification{
		PrimaryVerb:      verb,
		QueryFingerprint: fingerprint,
		TargetTables:     extractSQLTargetTables(normalized),
		RowLimit:         extractSQLRowLimit(normalized),
	}

	switch verb {
	case "select", "with", "explain", "values":
		classification.StatementClass = "read"
		classification.ReadOnly = true
		classification.Reason = "read-only query"
	case "pragma":
		if strings.EqualFold(strings.TrimSpace(driver), connectorDriverMCPSQLite) {
			classification.StatementClass = "schema_introspection"
			classification.ReadOnly = true
			classification.Reason = "read-only schema introspection"
			return classification
		}
		classification.StatementClass = "unsupported"
		classification.Reason = fmt.Sprintf("unsupported SQL statement %q", verb)
	case "show":
		if strings.EqualFold(strings.TrimSpace(driver), connectorDriverMCPPostgres) {
			classification.StatementClass = "schema_introspection"
			classification.ReadOnly = true
			classification.Reason = "read-only schema introspection"
			return classification
		}
		classification.StatementClass = "unsupported"
		classification.Reason = fmt.Sprintf("unsupported SQL statement %q", verb)
	default:
		classification.StatementClass = "unsupported"
		classification.Reason = fmt.Sprintf("unsupported SQL statement %q", verb)
	}
	return classification
}

func sqlQueryClassificationMap(classification sqlQueryClassification) map[string]interface{} {
	payload := map[string]interface{}{
		"statementClass":    classification.StatementClass,
		"primaryVerb":       classification.PrimaryVerb,
		"readOnlyCandidate": classification.ReadOnly,
		"readOnly":          classification.ReadOnly,
		"queryFingerprint":  classification.QueryFingerprint,
	}
	if len(classification.TargetTables) > 0 {
		payload["targetTables"] = append([]string(nil), classification.TargetTables...)
	}
	if classification.RowLimit > 0 {
		payload["rowLimit"] = classification.RowLimit
	}
	if classification.Reason != "" {
		payload["reason"] = classification.Reason
	}
	return payload
}

func extractLeadingSQLVerb(query string) string {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return ""
	}
	start := 0
	for start < len(trimmed) {
		r := trimmed[start]
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') {
			break
		}
		start++
	}
	end := start
	for end < len(trimmed) {
		r := trimmed[end]
		if !((r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z')) {
			break
		}
		end++
	}
	return trimmed[start:end]
}

func extractSQLTargetTables(query string) []string {
	matches := sqlTablePattern.FindAllStringSubmatch(query, -1)
	if len(matches) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(matches))
	tables := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		tableName := strings.ToLower(strings.TrimSpace(match[2]))
		if tableName == "" {
			continue
		}
		if _, ok := seen[tableName]; ok {
			continue
		}
		seen[tableName] = struct{}{}
		tables = append(tables, tableName)
	}
	sort.Strings(tables)
	return tables
}

func extractSQLRowLimit(query string) int {
	match := sqlLimitPattern.FindStringSubmatch(query)
	if len(match) < 2 {
		return 0
	}
	value, err := strconv.Atoi(strings.TrimSpace(match[1]))
	if err != nil || value <= 0 {
		return 0
	}
	return value
}

func limitConnectorRows(rows []map[string]interface{}, maxRows int) []map[string]interface{} {
	if len(rows) == 0 || maxRows <= 0 {
		return []map[string]interface{}{}
	}
	limit := len(rows)
	if limit > maxRows {
		limit = maxRows
	}
	out := make([]map[string]interface{}, 0, limit)
	for i := 0; i < limit; i++ {
		encoded, err := json.Marshal(rows[i])
		if err != nil {
			out = append(out, rows[i])
			continue
		}
		var cloned map[string]interface{}
		if err := json.Unmarshal(encoded, &cloned); err != nil {
			out = append(out, rows[i])
			continue
		}
		out = append(out, cloned)
	}
	return out
}

func connectorProfileMetadata(profile connectorProfileConfig) map[string]interface{} {
	metadata := map[string]interface{}{
		"id":     profile.ID,
		"label":  profile.Label,
		"driver": profile.Driver,
	}
	switch profile.Driver {
	case connectorDriverMCPSQLite:
		if strings.TrimSpace(profile.DatabasePath) != "" {
			metadata["databaseLabel"] = filepath.Base(profile.DatabasePath)
		}
	case connectorDriverMCPPostgres:
		if strings.TrimSpace(profile.ConnectionURI) != "" {
			if parsed, err := url.Parse(strings.TrimSpace(profile.ConnectionURI)); err == nil {
				if host := strings.TrimSpace(parsed.Host); host != "" {
					metadata["endpointLabel"] = host
				}
				if dbName := strings.Trim(strings.TrimSpace(parsed.Path), "/"); dbName != "" {
					metadata["databaseLabel"] = dbName
				}
			}
		}
	case connectorDriverMCPFilesystem:
		if strings.TrimSpace(profile.RootPath) != "" {
			metadata["rootLabel"] = filepath.Base(profile.RootPath)
		}
	case connectorDriverMCPGitHub:
		if strings.TrimSpace(profile.EndpointRef) != "" {
			metadata["endpointRef"] = profile.EndpointRef
		}
		if strings.TrimSpace(profile.CredentialRef) != "" {
			metadata["credentialRef"] = profile.CredentialRef
		}
		if len(profile.AllowedOwners) > 0 {
			metadata["allowedOwners"] = append([]string(nil), profile.AllowedOwners...)
		}
		if len(profile.AllowedRepos) > 0 {
			metadata["allowedRepos"] = append([]string(nil), profile.AllowedRepos...)
		}
	}
	return metadata
}
