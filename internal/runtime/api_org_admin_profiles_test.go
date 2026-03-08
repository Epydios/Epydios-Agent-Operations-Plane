package runtime

import (
	"net/http"
	"testing"
)

func TestRuntimeV1Alpha2OrgAdminCatalog(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/org-admin-profiles", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET org admin profiles status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response OrgAdminCatalogResponse
	decodeResponseBody(t, rr, &response)
	if response.Count != len(response.Items) {
		t.Fatalf("catalog count=%d want %d", response.Count, len(response.Items))
	}
	if response.Count < 3 {
		t.Fatalf("catalog count=%d want at least 3", response.Count)
	}

	var sawCentralized bool
	var sawRegulated bool
	for _, item := range response.Items {
		switch item.ProfileID {
		case "centralized_enterprise_admin":
			sawCentralized = true
			if len(item.GroupRoleMappingInputs) == 0 {
				t.Fatalf("centralized_enterprise_admin group mapping inputs missing: %+v", item)
			}
			if len(item.BreakGlassRoleBundles) == 0 {
				t.Fatalf("centralized_enterprise_admin break-glass bundles missing: %+v", item)
			}
			if len(item.EnforcementProfiles) == 0 {
				t.Fatalf("centralized_enterprise_admin enforcement profiles missing: %+v", item)
			}
			if len(item.DirectorySyncMappings) == 0 {
				t.Fatalf("centralized_enterprise_admin directory sync mappings missing: %+v", item)
			}
			if len(item.ExceptionProfiles) == 0 {
				t.Fatalf("centralized_enterprise_admin exception profiles missing: %+v", item)
			}
			if len(item.OverlayProfiles) == 0 {
				t.Fatalf("centralized_enterprise_admin overlay profiles missing: %+v", item)
			}
			if len(item.DecisionBindings) == 0 {
				t.Fatalf("centralized_enterprise_admin decision bindings missing: %+v", item)
			}
		case "regulated_regional_admin":
			sawRegulated = true
			if len(item.ResidencyProfiles) == 0 {
				t.Fatalf("regulated_regional_admin residency profiles missing: %+v", item)
			}
			if len(item.LegalHoldProfiles) == 0 {
				t.Fatalf("regulated_regional_admin legal hold profiles missing: %+v", item)
			}
			if len(item.EnforcementProfiles) == 0 {
				t.Fatalf("regulated_regional_admin enforcement profiles missing: %+v", item)
			}
			if len(item.ExceptionProfiles) == 0 {
				t.Fatalf("regulated_regional_admin exception profiles missing: %+v", item)
			}
			if len(item.OverlayProfiles) == 0 {
				t.Fatalf("regulated_regional_admin overlay profiles missing: %+v", item)
			}
			if len(item.DecisionBindings) == 0 {
				t.Fatalf("regulated_regional_admin decision bindings missing: %+v", item)
			}
		}
	}
	if !sawCentralized {
		t.Fatalf("centralized_enterprise_admin profile missing: %+v", response.Items)
	}
	if !sawRegulated {
		t.Fatalf("regulated_regional_admin profile missing: %+v", response.Items)
	}
}

func TestRuntimeV1Alpha2OrgAdminCatalogFilters(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/org-admin-profiles?organizationModel=federated_business_unit&roleBundle=enterprise.business_unit_admin&clientSurface=workflow", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET filtered org admin profiles status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response OrgAdminCatalogResponse
	decodeResponseBody(t, rr, &response)
	if response.Count != 1 {
		t.Fatalf("filtered count=%d want 1", response.Count)
	}
	item := response.Items[0]
	if item.ProfileID != "federated_business_unit_admin" {
		t.Fatalf("profile id=%s want federated_business_unit_admin", item.ProfileID)
	}
	if item.OrganizationModel != "federated_business_unit" {
		t.Fatalf("organization model=%s", item.OrganizationModel)
	}
}
