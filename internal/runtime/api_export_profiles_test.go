package runtime

import (
	"net/http"
	"reflect"
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
	if response.Count < 10 {
		t.Fatalf("catalog count=%d want at least 10", response.Count)
	}

	var sawOperatorReview bool
	var sawAuditExport bool
	var sawIncidentExport bool
	var sawEvidenceExport bool
	var sawRunExport bool
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
			if !reflect.DeepEqual(item.ClientSurfaces, []string{"desktop"}) {
				t.Fatalf("incident_export client surfaces=%v", item.ClientSurfaces)
			}
			if !reflect.DeepEqual(item.AllowedAudiences, []string{"incident_response", "security_review", "executive_incident_review"}) {
				t.Fatalf("incident_export audiences=%v", item.AllowedAudiences)
			}
			if !reflect.DeepEqual(item.DeliveryChannels, []string{"download", "copy", "preview"}) {
				t.Fatalf("incident_export delivery channels=%v", item.DeliveryChannels)
			}
			if item.RedactionMode != "structured_and_text" {
				t.Fatalf("incident_export redaction mode=%q want structured_and_text", item.RedactionMode)
			}
		case "evidence_export":
			sawEvidenceExport = true
			if !reflect.DeepEqual(item.ClientSurfaces, []string{"runtime"}) {
				t.Fatalf("evidence_export client surfaces=%v", item.ClientSurfaces)
			}
			if item.DefaultAudience != "downstream_review" || item.DefaultRetentionClass != "archive" {
				t.Fatalf("evidence_export defaults=%+v", item)
			}
			if !reflect.DeepEqual(item.DeliveryChannels, []string{"download", "copy"}) {
				t.Fatalf("evidence_export delivery channels=%v", item.DeliveryChannels)
			}
			if item.RedactionMode != "structured_and_text" {
				t.Fatalf("evidence_export redaction mode=%q want structured_and_text", item.RedactionMode)
			}
		case "run_export":
			sawRunExport = true
			if !reflect.DeepEqual(item.ClientSurfaces, []string{"runtime"}) {
				t.Fatalf("run_export client surfaces=%v", item.ClientSurfaces)
			}
			if item.DefaultAudience != "downstream_review" {
				t.Fatalf("run_export defaultAudience=%q want downstream_review", item.DefaultAudience)
			}
			if item.DefaultRetentionClass != "archive" {
				t.Fatalf("run_export defaultRetentionClass=%q want archive", item.DefaultRetentionClass)
			}
			if !reflect.DeepEqual(item.AllowedAudiences, []string{"downstream_review", "security_review", "compliance_review"}) {
				t.Fatalf("run_export audiences=%v", item.AllowedAudiences)
			}
			if !reflect.DeepEqual(item.DeliveryChannels, []string{"download", "copy"}) {
				t.Fatalf("run_export delivery channels=%v", item.DeliveryChannels)
			}
			if item.RedactionMode != "structured_and_text" {
				t.Fatalf("run_export redaction mode=%q want structured_and_text", item.RedactionMode)
			}
		case "audit_export":
			sawAuditExport = true
			if !reflect.DeepEqual(item.ClientSurfaces, []string{"desktop", "runtime"}) {
				t.Fatalf("audit_export client surfaces=%v", item.ClientSurfaces)
			}
			if !reflect.DeepEqual(item.AllowedAudiences, []string{"downstream_review", "security_review", "compliance_review"}) {
				t.Fatalf("audit_export audiences=%v", item.AllowedAudiences)
			}
			if !reflect.DeepEqual(item.DeliveryChannels, []string{"download", "copy", "preview"}) {
				t.Fatalf("audit_export delivery channels=%v", item.DeliveryChannels)
			}
			if item.RedactionMode != "structured_and_text" {
				t.Fatalf("audit_export redaction mode=%q want structured_and_text", item.RedactionMode)
			}
		}
	}
	if !sawOperatorReview {
		t.Fatalf("operator_review export profile missing: %+v", response.Items)
	}
	if !sawIncidentExport {
		t.Fatalf("incident_export export profile missing: %+v", response.Items)
	}
	if !sawAuditExport {
		t.Fatalf("audit_export export profile missing: %+v", response.Items)
	}
	if !sawEvidenceExport {
		t.Fatalf("evidence_export export profile missing: %+v", response.Items)
	}
	if !sawRunExport {
		t.Fatalf("run_export export profile missing: %+v", response.Items)
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
	if !reflect.DeepEqual(item.DeliveryChannels, []string{"copy", "preview"}) {
		t.Fatalf("deliveryChannels=%v want [copy preview]", item.DeliveryChannels)
	}
	if item.RedactionMode != "text" {
		t.Fatalf("redactionMode=%q want text", item.RedactionMode)
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
