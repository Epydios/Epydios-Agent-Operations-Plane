package runtime

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type runtimeExportDisposition struct {
	ClientSurface  string
	ReportType     string
	ExportProfile  string
	Audience       string
	RetentionClass string
	RedactionMode  string
}

func resolveRuntimeExportDisposition(r *http.Request, defaultProfile string) (runtimeExportDisposition, error) {
	disposition := runtimeExportDisposition{
		ClientSurface: "runtime",
		ReportType:    "export",
	}
	requestedProfile := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("exportProfile")))
	if requestedProfile == "" {
		requestedProfile = strings.TrimSpace(strings.ToLower(defaultProfile))
	}
	if requestedProfile == "" {
		return disposition, fmt.Errorf("exportProfile is required")
	}

	var matched *ExportProfileCatalogEntry
	items := defaultExportProfileCatalog()
	for i := range items {
		item := items[i]
		if !strings.EqualFold(item.ExportProfile, requestedProfile) {
			continue
		}
		if len(item.ReportTypes) > 0 && !selectorMatches(item.ReportTypes, disposition.ReportType) {
			continue
		}
		if len(item.ClientSurfaces) > 0 && !selectorMatches(item.ClientSurfaces, disposition.ClientSurface) {
			continue
		}
		copyItem := item
		matched = &copyItem
		break
	}
	if matched == nil {
		return disposition, fmt.Errorf("exportProfile %q is not available for runtime export", requestedProfile)
	}

	audience := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("audience")))
	if audience == "" {
		audience = strings.TrimSpace(strings.ToLower(matched.DefaultAudience))
	}
	if audience == "" {
		return disposition, fmt.Errorf("audience is required for exportProfile %q", requestedProfile)
	}
	if len(matched.AllowedAudiences) > 0 && !selectorMatches(matched.AllowedAudiences, audience) {
		return disposition, fmt.Errorf("audience %q is not allowed for exportProfile %q", audience, requestedProfile)
	}

	retentionClass := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("exportRetentionClass")))
	if retentionClass == "" {
		if overlay := strings.TrimSpace(strings.ToLower(matched.AudienceRetentionClassOverlays[audience])); overlay != "" {
			retentionClass = overlay
		} else {
			retentionClass = strings.TrimSpace(strings.ToLower(matched.DefaultRetentionClass))
		}
	}
	if retentionClass == "" {
		return disposition, fmt.Errorf("exportRetentionClass is required for exportProfile %q", requestedProfile)
	}
	if len(matched.AllowedRetentionClasses) > 0 && !selectorMatches(matched.AllowedRetentionClasses, retentionClass) {
		return disposition, fmt.Errorf("exportRetentionClass %q is not allowed for exportProfile %q", retentionClass, requestedProfile)
	}

	disposition.ExportProfile = requestedProfile
	disposition.Audience = audience
	disposition.RetentionClass = retentionClass
	disposition.RedactionMode = strings.TrimSpace(matched.RedactionMode)
	return disposition, nil
}

func applyRuntimeExportHeaders(w http.ResponseWriter, disposition runtimeExportDisposition, redactionCount int) {
	w.Header().Set("X-AgentOps-Client-Surface", disposition.ClientSurface)
	w.Header().Set("X-AgentOps-Report-Type", disposition.ReportType)
	w.Header().Set("X-AgentOps-Export-Profile", disposition.ExportProfile)
	w.Header().Set("X-AgentOps-Export-Audience", disposition.Audience)
	w.Header().Set("X-AgentOps-Export-Retention-Class", disposition.RetentionClass)
	if disposition.RedactionMode != "" {
		w.Header().Set("X-AgentOps-Redaction-Mode", disposition.RedactionMode)
	}
	if redactionCount > 0 {
		w.Header().Set("X-AgentOps-Export-Redactions", strconv.Itoa(redactionCount))
	}
}
