package runtime

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestProviderRegistrySelectProviderFromMultiOverrideFile(t *testing.T) {
	t.Parallel()

	overridePath := filepath.Join(t.TempDir(), "provider-overrides.json")
	payload := `{
  "version": 1,
  "overrides": [
    {
      "active": true,
      "providerType": "ProfileResolver",
      "providerId": "oss-profile-static-resolver",
      "providerName": "oss-profile-static-resolver",
      "endpointUrl": "http://127.0.0.1:18181",
      "timeoutSeconds": 10,
      "authMode": "None",
      "capabilities": ["profile.resolve"],
      "mode": "local-runtime-bridge"
    },
    {
      "active": false,
      "providerType": "PolicyProvider",
      "providerId": "oss-policy-opa",
      "providerName": "oss-policy-opa",
      "endpointUrl": "http://127.0.0.1:18182",
      "timeoutSeconds": 10,
      "authMode": "None",
      "capabilities": ["policy.evaluate"],
      "mode": "oss-only"
    },
    {
      "active": true,
      "providerType": "PolicyProvider",
      "providerId": "premium-provider-local",
      "providerName": "premium-provider-local",
      "endpointUrl": "http://127.0.0.1:4271",
      "timeoutSeconds": 10,
      "authMode": "None",
      "capabilities": ["policy.evaluate", "policy.defer"],
      "mode": "provider-route-local"
    }
  ]
}`
	if err := os.WriteFile(overridePath, []byte(payload), 0o600); err != nil {
		t.Fatalf("write override file: %v", err)
	}

	registry := NewProviderRegistry(nil, overridePath)

	profileProvider, err := registry.SelectProvider(context.Background(), "epydios-system", "ProfileResolver", "profile.resolve", "", 0)
	if err != nil {
		t.Fatalf("select profile override: %v", err)
	}
	if got, want := profileProvider.ProviderID, "oss-profile-static-resolver"; got != want {
		t.Fatalf("profile provider id = %q want %q", got, want)
	}
	if got, want := profileProvider.EndpointURL, "http://127.0.0.1:18181"; got != want {
		t.Fatalf("profile endpoint = %q want %q", got, want)
	}

	policyProvider, err := registry.SelectProvider(context.Background(), "epydios-system", "PolicyProvider", "policy.evaluate", "", 0)
	if err != nil {
		t.Fatalf("select policy override: %v", err)
	}
	if got, want := policyProvider.ProviderID, "premium-provider-local"; got != want {
		t.Fatalf("policy provider id = %q want %q", got, want)
	}
	if got, want := policyProvider.EndpointURL, "http://127.0.0.1:4271"; got != want {
		t.Fatalf("policy endpoint = %q want %q", got, want)
	}
}

func TestProviderRegistrySelectProviderFromLegacySingleOverrideFile(t *testing.T) {
	t.Parallel()

	overridePath := filepath.Join(t.TempDir(), "provider-override.json")
	payload := `{
  "active": true,
  "providerType": "PolicyProvider",
  "providerId": "premium-provider-local",
  "providerName": "premium-provider-local",
  "endpointUrl": "http://127.0.0.1:4271",
  "timeoutSeconds": 10,
  "authMode": "None",
  "capabilities": ["policy.evaluate", "policy.defer"],
  "mode": "provider-route-local"
}`
	if err := os.WriteFile(overridePath, []byte(payload), 0o600); err != nil {
		t.Fatalf("write legacy override file: %v", err)
	}

	registry := NewProviderRegistry(nil, overridePath)
	policyProvider, err := registry.SelectProvider(context.Background(), "epydios-system", "PolicyProvider", "policy.evaluate", "", 0)
	if err != nil {
		t.Fatalf("select legacy policy override: %v", err)
	}
	if got, want := policyProvider.ProviderID, "premium-provider-local"; got != want {
		t.Fatalf("policy provider id = %q want %q", got, want)
	}
}
