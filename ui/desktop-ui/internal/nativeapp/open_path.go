package nativeapp

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func resolveOpenPath(manifest SessionManifest, candidate string) (string, error) {
	raw := strings.TrimSpace(candidate)
	if raw == "" {
		return "", fmt.Errorf("path is required")
	}
	cleaned := filepath.Clean(raw)
	if !filepath.IsAbs(cleaned) {
		return "", fmt.Errorf("path must be absolute")
	}
	allowedRoots := []string{
		filepath.Clean(manifest.Paths.ConfigRoot),
		filepath.Clean(manifest.Paths.CacheRoot),
	}
	allowed := false
	for _, root := range allowedRoots {
		if root == "." || root == "" {
			continue
		}
		if cleaned == root || strings.HasPrefix(cleaned, root+string(os.PathSeparator)) {
			allowed = true
			break
		}
	}
	if !allowed {
		return "", fmt.Errorf("path is outside the native shell support roots")
	}
	if _, err := os.Stat(cleaned); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("path does not exist")
		}
		return "", fmt.Errorf("stat path: %w", err)
	}
	return cleaned, nil
}

func OpenPath(manifest SessionManifest, candidate string) error {
	resolved, err := resolveOpenPath(manifest, candidate)
	if err != nil {
		return err
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", resolved)
	case "linux":
		cmd = exec.Command("xdg-open", resolved)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", resolved)
	default:
		return fmt.Errorf("open path is unsupported on %s", runtime.GOOS)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("open %s: %w", resolved, err)
	}
	return nil
}
