package runtimeclient

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestLoadEnterpriseReportSelectionCatalog(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripSelectionFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path != "/v1alpha2/runtime/export-profiles" {
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader("not found")),
				Request:    req,
			}, nil
		}
		payload := runtimeapi.ExportProfileCatalogResponse{
			GeneratedAt: time.Now().UTC(),
			Source:      "test",
			Count:       1,
			Items: []runtimeapi.ExportProfileCatalogEntry{{
				ExportProfile:           "operator_review",
				Label:                   "Operator Review",
				DefaultAudience:         "operator",
				AllowedAudiences:        []string{"operator", "security_review"},
				DefaultRetentionClass:   "standard",
				AllowedRetentionClasses: []string{"standard", "archive"},
				ClientSurfaces:          []string{"cli"},
				ReportTypes:             []string{"report"},
				DeliveryChannels:        []string{"report"},
				RedactionMode:           "structured_and_text",
			}},
		}
		if req.URL.Query().Get("exportProfile") == "operator_review" && req.URL.Query().Get("audience") == "operator" {
			body, _ := json.Marshal(payload)
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(string(body))),
				Request:    req,
			}, nil
		}
		body, _ := json.Marshal(runtimeapi.ExportProfileCatalogResponse{
			GeneratedAt: time.Now().UTC(),
			Source:      "test",
			Count:       0,
			Items:       []runtimeapi.ExportProfileCatalogEntry{},
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(string(body))),
			Request:    req,
		}, nil
	})}
	client := NewClientWithHTTPClient(Config{RuntimeAPIBaseURL: "http://runtime.test"}, httpClient)

	catalog, disposition, err := LoadEnterpriseReportSelectionCatalog(context.Background(), client, "report", "cli", EnterpriseReportSelection{})
	if err != nil {
		t.Fatalf("LoadEnterpriseReportSelectionCatalog() unexpected error: %v", err)
	}
	if disposition.ExportProfile != "operator_review" || disposition.Audience != "operator" || disposition.RetentionClass != "standard" {
		t.Fatalf("unexpected default disposition: %#v", disposition)
	}
	if catalog == nil || len(catalog.Items) != 1 {
		t.Fatalf("expected one default catalog item, got %#v", catalog)
	}

	_, _, err = LoadEnterpriseReportSelectionCatalog(context.Background(), client, "report", "cli", EnterpriseReportSelection{
		ExportProfile: "missing_profile",
		Audience:      "operator",
	})
	if err == nil || !strings.Contains(err.Error(), "no governed export profile matched") {
		t.Fatalf("expected selection mismatch error, got %v", err)
	}
}

type roundTripSelectionFunc func(*http.Request) (*http.Response, error)

func (fn roundTripSelectionFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}
