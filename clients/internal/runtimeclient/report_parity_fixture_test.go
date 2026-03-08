package runtimeclient

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type reportParityFixture struct {
	ExportProfiles   runtimeapi.ExportProfileCatalogResponse `json:"exportProfiles"`
	OrgAdminProfiles runtimeapi.OrgAdminCatalogResponse      `json:"orgAdminProfiles"`
	Cases            []reportParityCase                      `json:"cases"`
}

type reportParityCase struct {
	ID      string                  `json:"id"`
	Subject EnterpriseReportSubject `json:"subject"`
	Expect  reportParityExpectation `json:"expect"`
}

type reportParityExpectation struct {
	ExportProfile     string `json:"exportProfile"`
	Audience          string `json:"audience"`
	RetentionClass    string `json:"retentionClass"`
	ClientSurface     string `json:"clientSurface"`
	RedactionCountMin int    `json:"redactionCountMin"`
}

func loadReportParityFixture(t *testing.T) reportParityFixture {
	t.Helper()
	path := filepath.Join("..", "..", "testdata", "m20-governed-report-parity.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read parity fixture: %v", err)
	}
	var fixture reportParityFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatalf("parse parity fixture: %v", err)
	}
	return fixture
}

func TestEnterpriseReportParityFixture(t *testing.T) {
	fixture := loadReportParityFixture(t)
	for _, item := range fixture.Cases {
		t.Run(item.ID, func(t *testing.T) {
			envelope := BuildEnterpriseReportEnvelope(item.Subject, &runtimeapi.PolicyPackCatalogResponse{}, &runtimeapi.WorkerCapabilityCatalogResponse{}, &fixture.ExportProfiles, &fixture.OrgAdminProfiles)
			if envelope.ExportProfile != item.Expect.ExportProfile {
				t.Fatalf("export profile=%q want %q", envelope.ExportProfile, item.Expect.ExportProfile)
			}
			if envelope.Audience != item.Expect.Audience {
				t.Fatalf("audience=%q want %q", envelope.Audience, item.Expect.Audience)
			}
			if envelope.RetentionClass != item.Expect.RetentionClass {
				t.Fatalf("retention class=%q want %q", envelope.RetentionClass, item.Expect.RetentionClass)
			}
			if envelope.ClientSurface != item.Expect.ClientSurface {
				t.Fatalf("client surface=%q want %q", envelope.ClientSurface, item.Expect.ClientSurface)
			}
			if envelope.RedactionCount < item.Expect.RedactionCountMin {
				t.Fatalf("redaction count=%d want >= %d", envelope.RedactionCount, item.Expect.RedactionCountMin)
			}
			if len(envelope.ApplicableOrgAdmins) == 0 {
				t.Fatalf("expected org-admin posture in envelope")
			}
			if len(envelope.DirectorySyncMappings) == 0 {
				t.Fatalf("expected directory-sync mapping coverage in envelope")
			}
			if len(envelope.DecisionBindingLabels) == 0 {
				t.Fatalf("expected decision binding coverage in envelope")
			}
			if len(envelope.ExceptionProfileLabels) == 0 {
				t.Fatalf("expected exception profile coverage in envelope")
			}
			if len(envelope.OverlayProfileLabels) == 0 {
				t.Fatalf("expected overlay profile coverage in envelope")
			}
			if len(item.Subject.ApprovalCheckpoints) > 0 {
				if len(envelope.ActiveOrgAdminDecisionBindings) == 0 {
					t.Fatalf("expected active org-admin decision bindings in envelope")
				}
				if len(envelope.ActiveOrgAdminInputKeys) == 0 {
					t.Fatalf("expected active org-admin input keys in envelope")
				}
				if envelope.ActiveOrgAdminPendingReviews <= 0 {
					t.Fatalf("expected active org-admin pending review count in envelope")
				}
			}
			rendered := RenderEnterpriseReportEnvelope(envelope)
			if strings.Contains(rendered, "sk-abc1234567890123456789") {
				t.Fatalf("rendered report leaked secret-like content: %s", rendered)
			}
			if !strings.Contains(rendered, "DLP findings:") {
				t.Fatalf("rendered report missing DLP findings: %s", rendered)
			}
			if !strings.Contains(rendered, "Overlay profile coverage:") {
				t.Fatalf("rendered report missing overlay profile coverage: %s", rendered)
			}
			if !strings.Contains(rendered, "Decision binding coverage:") {
				t.Fatalf("rendered report missing decision binding coverage: %s", rendered)
			}
			if len(item.Subject.ApprovalCheckpoints) > 0 && !strings.Contains(rendered, "Active org-admin decision bindings:") {
				t.Fatalf("rendered report missing active org-admin decision bindings: %s", rendered)
			}
		})
	}
}
