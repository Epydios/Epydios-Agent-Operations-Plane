package nativeapp

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveOpenPathAcceptsPathsUnderSupportRoots(t *testing.T) {
	t.Parallel()

	configRoot := t.TempDir()
	cacheRoot := t.TempDir()
	candidate := filepath.Join(configRoot, "runtime-service", "runtime-service.log")
	manifest := SessionManifest{
		Paths: SessionPaths{
			ConfigRoot: configRoot,
			CacheRoot:  cacheRoot,
		},
	}
	if err := os.MkdirAll(filepath.Dir(candidate), 0o755); err != nil {
		t.Fatalf("mkdir candidate dir: %v", err)
	}
	if err := os.WriteFile(candidate, []byte("log"), 0o644); err != nil {
		t.Fatalf("write candidate: %v", err)
	}

	resolved, err := resolveOpenPath(manifest, candidate)
	if err != nil {
		t.Fatalf("resolveOpenPath returned error: %v", err)
	}
	if resolved != candidate {
		t.Fatalf("resolved path mismatch: got %q want %q", resolved, candidate)
	}
}

func TestResolveOpenPathRejectsPathsOutsideSupportRoots(t *testing.T) {
	t.Parallel()

	configRoot := t.TempDir()
	cacheRoot := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.log")
	manifest := SessionManifest{
		Paths: SessionPaths{
			ConfigRoot: configRoot,
			CacheRoot:  cacheRoot,
		},
	}
	if err := os.WriteFile(outside, []byte("log"), 0o644); err != nil {
		t.Fatalf("write outside: %v", err)
	}

	if _, err := resolveOpenPath(manifest, outside); err == nil {
		t.Fatalf("resolveOpenPath should reject paths outside support roots")
	}
}
