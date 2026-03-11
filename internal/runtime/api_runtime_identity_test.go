package runtime

import (
	"context"
	"net/http"
	"testing"
)

func TestRuntimeV1Alpha2IdentityWithoutAuth(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/identity", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET runtime identity status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response RuntimeIdentityResponse
	decodeResponseBody(t, rr, &response)
	if response.AuthEnabled {
		t.Fatalf("authEnabled=%v want false", response.AuthEnabled)
	}
	if response.Authenticated {
		t.Fatalf("authenticated=%v want false", response.Authenticated)
	}
	if response.AuthorityBasis != "runtime_auth_disabled" {
		t.Fatalf("authorityBasis=%q want runtime_auth_disabled", response.AuthorityBasis)
	}
	if len(response.Identity.EffectivePermissions) != 2 {
		t.Fatalf("effectivePermissions=%v want read/create defaults", response.Identity.EffectivePermissions)
	}
}

func TestRuntimeV1Alpha2IdentityWithContextIdentity(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	reqCtx := withRuntimeIdentity(context.Background(), &RuntimeIdentity{
		Subject:    "operator-123",
		ClientID:   "desktop-local",
		Roles:      []string{"runtime.admin", "enterprise.ai_operator"},
		TenantIDs:  []string{"tenant-a"},
		ProjectIDs: []string{"project-a"},
		Claims: map[string]interface{}{
			"sub":        "operator-123",
			"client_id":  "desktop-local",
			"tenant_id":  "tenant-a",
			"project_id": "project-a",
			"roles":      []string{"runtime.admin", "enterprise.ai_operator"},
		},
	})
	rr := requestJSONWithContext(t, handler, reqCtx, http.MethodGet, "/v1alpha2/runtime/identity", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET runtime identity with context status=%d body=%s", rr.Code, rr.Body.String())
	}

	var response RuntimeIdentityResponse
	decodeResponseBody(t, rr, &response)
	if !response.Authenticated {
		t.Fatalf("authenticated=%v want true", response.Authenticated)
	}
	if response.Identity.Subject != "operator-123" {
		t.Fatalf("subject=%q want operator-123", response.Identity.Subject)
	}
	if response.Identity.ClientID != "desktop-local" {
		t.Fatalf("clientId=%q want desktop-local", response.Identity.ClientID)
	}
	if len(response.Identity.ClaimKeys) == 0 {
		t.Fatalf("claimKeys=%v want populated keys", response.Identity.ClaimKeys)
	}
}
