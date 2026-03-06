package runtime

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestNormalizeProviderTargetOSAliases(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "linux", in: "linux", want: desktopOSLinux},
		{name: "windows alias", in: "win", want: desktopOSWindows},
		{name: "windows canonical", in: "windows", want: desktopOSWindows},
		{name: "mac alias", in: "darwin", want: desktopOSMacOS},
		{name: "mac canonical", in: "macos", want: desktopOSMacOS},
		{name: "empty", in: "", want: ""},
		{name: "any", in: "any", want: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := normalizeProviderTargetOS(tc.in)
			if got != tc.want {
				t.Fatalf("normalizeProviderTargetOS(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestProviderTargetOSMatchesLegacyDefaultsToLinux(t *testing.T) {
	if !providerTargetOSMatches("", desktopOSLinux) {
		t.Fatalf("expected empty provider targetOS to match linux for legacy compatibility")
	}
	if providerTargetOSMatches("", desktopOSWindows) {
		t.Fatalf("expected empty provider targetOS to not match windows")
	}
}

func TestResolveProviderTargetOSPrefersResolvedSpecAndInference(t *testing.T) {
	item := unstructured.Unstructured{}
	item.SetName("oss-desktop-openfang-macos")
	item.SetAnnotations(map[string]string{
		"epydios.ai/target-os": "windows",
	})

	status := map[string]interface{}{
		"resolved": map[string]interface{}{
			"targetOS": "linux",
		},
	}
	spec := map[string]interface{}{
		"targetOS": "macos",
		"annotations": map[string]interface{}{
			"epydios.ai/target-os": "windows",
		},
	}

	got := resolveProviderTargetOS(item, spec, status, "oss-desktop-openfang-windows")
	if got != desktopOSLinux {
		t.Fatalf("resolveProviderTargetOS() = %q, want %q (status.resolved.targetOS precedence)", got, desktopOSLinux)
	}
}

func TestResolveProviderTargetOSFallsBackToProviderIDInference(t *testing.T) {
	item := unstructured.Unstructured{}
	item.SetName("desktop-provider")

	got := resolveProviderTargetOS(item, map[string]interface{}{}, map[string]interface{}{}, "oss-desktop-openfang-windows")
	if got != desktopOSWindows {
		t.Fatalf("resolveProviderTargetOS() = %q, want %q", got, desktopOSWindows)
	}
}
