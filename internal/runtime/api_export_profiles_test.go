package runtime

import (
	"net/http"
	"testing"
)

func TestRuntimeV1Alpha2ExportProfileCatalog(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/export-profiles", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET export profiles status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response ExportProfileCatalogResponse
	decodeResponseBody(t, rr, &response)
	if response.Count != len(response.Items) {
		t.Fatalf("catalog count=%d want %d", response.Count, len(response.Items))
	}
	if response.Count < 9 {
		t.Fatalf("catalog count=%d want at least 9", response.Count)
	}

	var sawOperatorReview bool
	var sawIncidentExport bool
	var sawEvidenceExport bool
	for _, item := range response.Items {
		switch item.ExportProfile {
		case "operator_review":
			sawOperatorReview = true
			if item.DefaultAudience != "operator" {
				t.Fatalf("operator_review defaultAudience=%q want operator", item.DefaultAudience)
			}
			if item.DefaultRetentionClass != "standard" {
				t.Fatalf("operator_review defaultRetentionClass=%q want standard", item.DefaultRetentionClass)
			}
			if got := item.AudienceRetentionClassOverlays["security_review"]; got != "archive" {
				t.Fatalf("operator_review security_review retention=%q want archive", got)
			}
		case "incident_export":
			sawIncidentExport = true
			if len(item.ClientSurfaces) == 0 || item.ClientSurfaces[0] == "" {
				t.Fatalf("incident_export client surfaces missing: %+v", item)
			}
			if len(item.AllowedAudiences) == 0 {
				t.Fatalf("incident_export audiences missing: %+v", item)
			}
			if len(item.AllowedRetentionClasses) == 0 {
				t.Fatalf("incident_export retention classes missing: %+v", item)
			}
		case "evidence_export":
			sawEvidenceExport = true
			if len(item.ClientSurfaces) == 0 || item.ClientSurfaces[0] != "runtime" {
				t.Fatalf("evidence_export runtime surface missing: %+v", item)
			}
			if item.DefaultAudience == "" || item.DefaultRetentionClass == "" {
				t.Fatalf("evidence_export defaults missing: %+v", item)
			}
		}
	}
	if !sawOperatorReview {
		t.Fatalf("operator_review export profile missing: %+v", response.Items)
	}
	if !sawIncidentExport {
		t.Fatalf("incident_export export profile missing: %+v", response.Items)
	}
	if !sawEvidenceExport {
		t.Fatalf("evidence_export export profile missing: %+v", response.Items)
	}
}

func TestRuntimeV1Alpha2ExportProfileCatalogFilters(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/export-profiles?clientSurface=desktop&reportType=handoff&audience=incident_response&exportProfile=incident_handoff", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET filtered export profiles status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response ExportProfileCatalogResponse
	decodeResponseBody(t, rr, &response)
	if response.Count != 1 {
		t.Fatalf("filtered count=%d want 1", response.Count)
	}
	item := response.Items[0]
	if item.ExportProfile != "incident_handoff" {
		t.Fatalf("exportProfile=%q want incident_handoff", item.ExportProfile)
	}
	if item.DefaultAudience != "incident_response" {
		t.Fatalf("defaultAudience=%q want incident_response", item.DefaultAudience)
	}
}

func TestRuntimeV1Alpha2ExportProfileCatalogFiltersByRetentionClass(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/export-profiles?clientSurface=desktop&reportType=handoff&retentionClass=short", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET filtered export profiles by retention class status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response ExportProfileCatalogResponse
	decodeResponseBody(t, rr, &response)
	if response.Count == 0 {
		t.Fatalf("filtered count=%d want >0", response.Count)
	}
	for _, item := range response.Items {
		allRetention := append([]string(nil), item.AllowedRetentionClasses...)
		allRetention = append(allRetention, item.DefaultRetentionClass)
		matched := false
		for _, candidate := range allRetention {
			if candidate == "short" {
				matched = true
				break
			}
		}
		if !matched {
			t.Fatalf("item=%+v did not match requested retention class short", item)
		}
	}
}
