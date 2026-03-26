package runtime

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	connectorFilesystemPreviewBytes = 2048
	connectorFilesystemPreviewItems = 10
)

type filesystemConnectorTarget struct {
	RequestedPath string
	ResolvedPath  string
	RelativePath  string
	ResourceKind  string
	RootLabel     string
	Contained     bool
	Reason        string
}

func normalizeAndClassifyFilesystemConnectorRequest(profile connectorProfileConfig, toolName string, args JSONObject) (JSONObject, JSONObject, error) {
	out := cloneJSONObject(args)
	requestedPath, _ := out["path"].(string)
	requestedPath = strings.TrimSpace(requestedPath)
	switch toolName {
	case connectorToolReadText:
		if requestedPath == "" {
			return nil, nil, fmt.Errorf("connector.arguments.path is required")
		}
	case connectorToolListDirectory:
		if requestedPath == "" {
			requestedPath = "."
		}
	default:
		return nil, nil, fmt.Errorf("connector tool %q is not supported", toolName)
	}

	target, err := classifyFilesystemConnectorTarget(profile.RootPath, toolName, requestedPath)
	if err != nil {
		return nil, nil, err
	}
	if target.Contained {
		out["path"] = target.RelativePath
	} else {
		out["path"] = requestedPath
	}
	return out, buildFilesystemConnectorClassification(toolName, target), nil
}

func executeMCPFilesystemConnector(_ context.Context, plan *connectorExecutionPlan) (map[string]interface{}, error) {
	requestedPath, _ := plan.Arguments["path"].(string)
	target, err := classifyFilesystemConnectorTarget(plan.Profile.RootPath, plan.ToolName, strings.TrimSpace(requestedPath))
	if err != nil {
		return nil, err
	}
	if !target.Contained {
		return nil, fmt.Errorf("connector %s denied path outside configured root: %s", connectorDriverMCPFilesystem, target.Reason)
	}

	switch plan.ToolName {
	case connectorToolReadText:
		content, err := os.ReadFile(target.ResolvedPath)
		if err != nil {
			return nil, fmt.Errorf("read filesystem file: %w", err)
		}
		preview := content
		truncated := false
		if len(preview) > connectorFilesystemPreviewBytes {
			preview = preview[:connectorFilesystemPreviewBytes]
			truncated = true
		}
		result := map[string]interface{}{
			"driver":                 connectorDriverMCPFilesystem,
			"toolName":               plan.ToolName,
			"connectorId":            plan.Profile.ID,
			"connectorLabel":         plan.Profile.Label,
			"rootLabel":              target.RootLabel,
			"relativePath":           target.RelativePath,
			"resourceKind":           target.ResourceKind,
			"bytesRead":              len(content),
			"textPreview":            string(preview),
			"resultPreviewTruncated": truncated,
		}
		if note := strings.TrimSpace(plan.ApprovalNote); note != "" {
			result["approvalNote"] = note
		}
		return result, nil
	case connectorToolListDirectory:
		entries, err := os.ReadDir(target.ResolvedPath)
		if err != nil {
			return nil, fmt.Errorf("list filesystem directory: %w", err)
		}
		previewLimit := len(entries)
		if previewLimit > connectorFilesystemPreviewItems {
			previewLimit = connectorFilesystemPreviewItems
		}
		preview := make([]map[string]interface{}, 0, previewLimit)
		for i := 0; i < previewLimit; i++ {
			entry := entries[i]
			entryKind := "file"
			if entry.IsDir() {
				entryKind = "directory"
			}
			preview = append(preview, map[string]interface{}{
				"name": entry.Name(),
				"kind": entryKind,
			})
		}
		result := map[string]interface{}{
			"driver":                 connectorDriverMCPFilesystem,
			"toolName":               plan.ToolName,
			"connectorId":            plan.Profile.ID,
			"connectorLabel":         plan.Profile.Label,
			"rootLabel":              target.RootLabel,
			"relativePath":           target.RelativePath,
			"resourceKind":           target.ResourceKind,
			"entryCount":             len(entries),
			"entriesPreview":         preview,
			"resultPreviewTruncated": len(entries) > previewLimit,
		}
		if note := strings.TrimSpace(plan.ApprovalNote); note != "" {
			result["approvalNote"] = note
		}
		return result, nil
	default:
		return nil, fmt.Errorf("connector tool %q is not supported", plan.ToolName)
	}
}

func classifyFilesystemConnectorTarget(rootPath, toolName, requestedPath string) (filesystemConnectorTarget, error) {
	rootAbs, err := filepath.Abs(strings.TrimSpace(rootPath))
	if err != nil {
		return filesystemConnectorTarget{}, fmt.Errorf("resolve filesystem rootPath: %w", err)
	}
	if strings.TrimSpace(rootAbs) == "" {
		return filesystemConnectorTarget{}, fmt.Errorf("connector filesystem rootPath is required")
	}
	requestedPath = strings.TrimSpace(requestedPath)
	if requestedPath == "" {
		requestedPath = "."
	}

	resourceKind := "file"
	primaryVerb := "read"
	if toolName == connectorToolListDirectory {
		resourceKind = "directory"
		primaryVerb = "list"
	}

	candidatePath := requestedPath
	if !filepath.IsAbs(candidatePath) {
		candidatePath = filepath.Join(rootAbs, candidatePath)
	}
	candidateAbs, err := filepath.Abs(candidatePath)
	if err != nil {
		return filesystemConnectorTarget{}, fmt.Errorf("resolve filesystem target path: %w", err)
	}
	relativePath, err := filepath.Rel(rootAbs, candidateAbs)
	if err != nil {
		return filesystemConnectorTarget{}, fmt.Errorf("compute filesystem relative path: %w", err)
	}
	relativePath = filepath.Clean(relativePath)
	contained := relativePath == "." || (!strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) && relativePath != "..")
	if !contained {
		return filesystemConnectorTarget{
			RequestedPath: requestedPath,
			ResourceKind:  resourceKind,
			RootLabel:     filepath.Base(rootAbs),
			Contained:     false,
			Reason:        fmt.Sprintf("%s path escapes the configured filesystem root", primaryVerb),
		}, nil
	}
	return filesystemConnectorTarget{
		RequestedPath: requestedPath,
		ResolvedPath:  candidateAbs,
		RelativePath:  filepath.ToSlash(relativePath),
		ResourceKind:  resourceKind,
		RootLabel:     filepath.Base(rootAbs),
		Contained:     true,
		Reason:        fmt.Sprintf("read-only %s inside configured filesystem root", resourceKind),
	}, nil
}

func buildFilesystemConnectorClassification(toolName string, target filesystemConnectorTarget) JSONObject {
	primaryVerb := "read"
	statementClass := "file_read"
	if toolName == connectorToolListDirectory {
		primaryVerb = "list"
		statementClass = "directory_list"
	}
	readOnlyCandidate := target.Contained
	if !target.Contained {
		statementClass = "path_traversal"
	}
	return JSONObject{
		"statementClass":    statementClass,
		"primaryVerb":       primaryVerb,
		"readOnlyCandidate": readOnlyCandidate,
		"readOnly":          readOnlyCandidate,
		"resourceKind":      target.ResourceKind,
		"requestedPath":     target.RequestedPath,
		"normalizedPath":    target.RelativePath,
		"pathContained":     target.Contained,
		"rootLabel":         target.RootLabel,
		"reason":            target.Reason,
	}
}
