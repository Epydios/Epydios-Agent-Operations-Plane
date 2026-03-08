package runtime

import (
	"encoding/json"
	"regexp"
)

var exportSensitivePatterns = []*regexp.Regexp{
	regexp.MustCompile(`sk-[a-zA-Z0-9]{12,}`),
	regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
	regexp.MustCompile(`-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----`),
	regexp.MustCompile(`\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b`),
	regexp.MustCompile(`Bearer\s+[A-Za-z0-9._-]{20,}`),
}

func redactExportStringWithCount(value string, count int) (string, int) {
	redacted := value
	for _, pattern := range exportSensitivePatterns {
		matches := pattern.FindAllString(redacted, -1)
		if len(matches) == 0 {
			continue
		}
		count += len(matches)
		redacted = pattern.ReplaceAllString(redacted, "[REDACTED]")
	}
	return redacted, count
}

func redactRunSummaryForExport(item RunSummary) (RunSummary, int) {
	redactions := 0
	item.RunID, redactions = redactExportStringWithCount(item.RunID, redactions)
	item.RequestID, redactions = redactExportStringWithCount(item.RequestID, redactions)
	item.TenantID, redactions = redactExportStringWithCount(item.TenantID, redactions)
	item.ProjectID, redactions = redactExportStringWithCount(item.ProjectID, redactions)
	item.Environment, redactions = redactExportStringWithCount(item.Environment, redactions)
	item.RetentionClass, redactions = redactExportStringWithCount(item.RetentionClass, redactions)
	item.PolicyDecision, redactions = redactExportStringWithCount(item.PolicyDecision, redactions)
	item.PolicyBundleID, redactions = redactExportStringWithCount(item.PolicyBundleID, redactions)
	item.PolicyBundleVersion, redactions = redactExportStringWithCount(item.PolicyBundleVersion, redactions)
	item.SelectedProfileProvider, redactions = redactExportStringWithCount(item.SelectedProfileProvider, redactions)
	item.SelectedPolicyProvider, redactions = redactExportStringWithCount(item.SelectedPolicyProvider, redactions)
	item.SelectedEvidenceProvider, redactions = redactExportStringWithCount(item.SelectedEvidenceProvider, redactions)
	item.SelectedDesktopProvider, redactions = redactExportStringWithCount(item.SelectedDesktopProvider, redactions)
	item.PolicyGrantTokenSHA256, redactions = redactExportStringWithCount(item.PolicyGrantTokenSHA256, redactions)
	return item, redactions
}

func redactAuditRecordForExport(item map[string]interface{}) (map[string]interface{}, int) {
	redacted, redactions := redactInterfaceValueForExport(cloneInterfaceMap(item), 0)
	record, _ := redacted.(map[string]interface{})
	if record == nil {
		record = map[string]interface{}{}
	}
	return record, redactions
}

func redactEvidenceRecordForExport(item EvidenceRecord) (EvidenceRecord, int) {
	redactions := 0
	item.EvidenceID, redactions = redactExportStringWithCount(item.EvidenceID, redactions)
	item.SessionID, redactions = redactExportStringWithCount(item.SessionID, redactions)
	item.ToolActionID, redactions = redactExportStringWithCount(item.ToolActionID, redactions)
	item.CheckpointID, redactions = redactExportStringWithCount(item.CheckpointID, redactions)
	item.TenantID, redactions = redactExportStringWithCount(item.TenantID, redactions)
	item.ProjectID, redactions = redactExportStringWithCount(item.ProjectID, redactions)
	item.Kind, redactions = redactExportStringWithCount(item.Kind, redactions)
	item.URI, redactions = redactExportStringWithCount(item.URI, redactions)
	item.Checksum, redactions = redactExportStringWithCount(item.Checksum, redactions)
	item.RetentionClass, redactions = redactExportStringWithCount(item.RetentionClass, redactions)
	if len(item.Metadata) > 0 {
		sanitized, count := redactJSONRawMessageForExport(item.Metadata)
		item.Metadata = sanitized
		redactions += count
	}
	return item, redactions
}

func redactJSONRawMessageForExport(raw json.RawMessage) (json.RawMessage, int) {
	if len(raw) == 0 {
		return raw, 0
	}
	var payload interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return raw, 0
	}
	redacted, count := redactInterfaceValueForExport(payload, 0)
	sanitized, err := json.Marshal(redacted)
	if err != nil {
		return raw, count
	}
	return sanitized, count
}

func redactInterfaceValueForExport(value interface{}, count int) (interface{}, int) {
	switch typed := value.(type) {
	case string:
		redacted, next := redactExportStringWithCount(typed, count)
		return redacted, next
	case map[string]interface{}:
		out := make(map[string]interface{}, len(typed))
		for key, item := range typed {
			redacted, next := redactInterfaceValueForExport(item, count)
			out[key] = redacted
			count = next
		}
		return out, count
	case []interface{}:
		out := make([]interface{}, len(typed))
		for i, item := range typed {
			redacted, next := redactInterfaceValueForExport(item, count)
			out[i] = redacted
			count = next
		}
		return out, count
	case []string:
		out := make([]string, len(typed))
		for i, item := range typed {
			redacted, next := redactExportStringWithCount(item, count)
			out[i] = redacted
			count = next
		}
		return out, count
	default:
		return value, count
	}
}
