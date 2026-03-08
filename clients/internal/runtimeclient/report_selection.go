package runtimeclient

import (
	"context"
	"flag"
	"fmt"
	"strings"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type EnterpriseReportSelection struct {
	ExportProfile  string
	Audience       string
	RetentionClass string
}

func BindEnterpriseReportSelectionFlags(fs *flag.FlagSet) *EnterpriseReportSelection {
	selection := &EnterpriseReportSelection{}
	fs.StringVar(&selection.ExportProfile, "export-profile", "", "optional governed export-profile override")
	fs.StringVar(&selection.Audience, "audience", "", "optional governed audience override")
	fs.StringVar(&selection.RetentionClass, "retention-class", "", "optional governed retention class override")
	return selection
}

func (s EnterpriseReportSelection) Normalize() EnterpriseReportSelection {
	return EnterpriseReportSelection{
		ExportProfile:  strings.TrimSpace(s.ExportProfile),
		Audience:       strings.TrimSpace(s.Audience),
		RetentionClass: strings.TrimSpace(s.RetentionClass),
	}
}

func LoadEnterpriseReportSelectionCatalog(ctx context.Context, client *Client, reportType, clientSurface string, selection EnterpriseReportSelection) (*runtimeapi.ExportProfileCatalogResponse, EnterpriseReportDisposition, error) {
	normalized := selection.Normalize()
	disposition := ResolveEnterpriseReportDisposition(clientSurface, reportType, normalized.ExportProfile, normalized.Audience)
	if normalized.RetentionClass != "" {
		disposition.RetentionClass = normalized.RetentionClass
	}
	catalog, err := client.ListExportProfiles(ctx, disposition.ExportProfile, reportType, clientSurface, disposition.Audience, disposition.RetentionClass)
	if err != nil {
		return nil, disposition, err
	}
	if normalized.ExportProfile != "" || normalized.Audience != "" || normalized.RetentionClass != "" {
		if catalog == nil || len(catalog.Items) == 0 {
			return nil, disposition, fmt.Errorf(
				"no governed export profile matched export-profile=%q audience=%q retention-class=%q for surface=%s report-type=%s",
				disposition.ExportProfile,
				disposition.Audience,
				disposition.RetentionClass,
				NormalizeStringOrDefault(clientSurface, "-"),
				NormalizeStringOrDefault(reportType, "report"),
			)
		}
	}
	return catalog, disposition, nil
}
